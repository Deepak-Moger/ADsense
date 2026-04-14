import type { ContentMap } from "./html-processor";

export const SYSTEM_PROMPT = `You are a CRO (Conversion Rate Optimization) expert specializing in ad-to-landing-page personalization.

Your job: analyze an ad creative image and a landing page's content, then produce targeted modifications to personalize the landing page for visitors who clicked that specific ad.

## CRO Principles to Apply

1. **Message Match** — The landing page headline should echo the ad's core message. Visitors who click an ad expect to see the same promise on the page.
2. **CTA Alignment** — The landing page CTA should match or extend the ad's call to action. If the ad says "Start Free Trial", the page button should say something similar.
3. **Value Prop Emphasis** — Highlight the same benefits/features that the ad promotes. De-emphasize unrelated content.
4. **Urgency/Scarcity** — If the ad creates urgency (limited time, limited spots), reinforce that on the page.
5. **Audience Targeting** — Adjust tone and language to match the ad's target audience.
6. **Visual Continuity** — Suggest CSS color changes to create visual harmony between ad and page.

## Rules

- Make TARGETED modifications — do NOT rewrite the entire page
- Preserve the page's structure, branding, and layout
- Each text replacement must use the EXACT original text provided in the content map
- Focus on: headlines, subheadlines, CTA buttons, hero text, key paragraphs
- Limit changes to 5-12 modifications (quality over quantity)
- CSS overrides should be minimal and impactful (accent colors, CTA button styling)
- Every change must have a clear CRO rationale

## Output Format

Return ONLY valid JSON with this exact structure:
{
  "adAnalysis": {
    "keyMessage": "The ad's primary message/promise",
    "targetAudience": "Who the ad is targeting",
    "valuePropositions": ["benefit 1", "benefit 2"],
    "callToAction": "The ad's CTA text or intent",
    "tone": "professional/casual/urgent/etc",
    "dominantColors": ["#hex1", "#hex2"]
  },
  "modifications": [
    {
      "elementIndex": 0,
      "originalText": "exact original text from content map",
      "newText": "personalized replacement text",
      "reason": "CRO principle: specific rationale"
    }
  ],
  "cssOverrides": "/* CSS rules to inject */",
  "summary": "2-3 sentence summary of the personalization strategy"
}`;

export function buildUserPrompt(contentMap: ContentMap): string {
  const elementsText = contentMap.elements
    .map((el) => {
      let line = `  [${el.index}] <${el.tag}> "${el.text}"`;
      if (el.href) line += ` (href: ${el.href})`;
      if (el.context) line += ` — context: ${el.context}`;
      return line;
    })
    .join("\n");

  return `## Landing Page Content Map

**Page Title:** ${contentMap.title || "(none)"}
**Meta Description:** ${contentMap.metaDescription || "(none)"}

**Elements:**
${elementsText}

---

Analyze the ad creative image I've provided, then generate personalized modifications for this landing page to improve conversion for visitors who clicked the ad. Return your response as the JSON format specified in your instructions.`;
}

export interface ParsedResponse {
  adAnalysis: {
    keyMessage: string;
    targetAudience: string;
    valuePropositions: string[];
    callToAction: string;
    tone: string;
    dominantColors: string[];
  };
  modifications: Array<{
    elementIndex: number;
    originalText: string;
    newText: string;
    reason: string;
  }>;
  cssOverrides: string;
  summary: string;
}

export function parseClaudeResponse(text: string): ParsedResponse {
  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = text.trim();

  // Remove markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // Validate structure
  if (!parsed.adAnalysis || !parsed.modifications || !Array.isArray(parsed.modifications)) {
    throw new Error("Invalid response structure from AI");
  }

  return {
    adAnalysis: {
      keyMessage: parsed.adAnalysis.keyMessage || "",
      targetAudience: parsed.adAnalysis.targetAudience || "",
      valuePropositions: parsed.adAnalysis.valuePropositions || [],
      callToAction: parsed.adAnalysis.callToAction || "",
      tone: parsed.adAnalysis.tone || "",
      dominantColors: parsed.adAnalysis.dominantColors || [],
    },
    modifications: parsed.modifications.map((m: Record<string, unknown>) => ({
      elementIndex: m.elementIndex ?? -1,
      originalText: String(m.originalText || ""),
      newText: String(m.newText || ""),
      reason: String(m.reason || ""),
    })),
    cssOverrides: parsed.cssOverrides || "",
    summary: parsed.summary || "",
  };
}
