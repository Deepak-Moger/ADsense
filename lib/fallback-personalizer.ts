import type { ContentMap, Modification } from "./html-processor";

interface FallbackAdAnalysis {
  keyMessage: string;
  targetAudience: string;
  valuePropositions: string[];
  callToAction: string;
  tone: string;
  dominantColors: string[];
}

export interface FallbackPersonalization {
  adAnalysis: FallbackAdAnalysis;
  modifications: Modification[];
  cssOverrides: string;
  summary: string;
}

const DEFAULT_ANALYSIS: FallbackAdAnalysis = {
  keyMessage: "Clear value and fast outcomes",
  targetAudience: "High-intent visitors from paid campaigns",
  valuePropositions: [
    "Faster time to value",
    "Lower risk with transparent onboarding",
    "Clear next-step call to action",
  ],
  callToAction: "Get Started",
  tone: "confident",
  dominantColors: ["#0f766e", "#f59e0b"],
};

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractKeywords(seed: string): string[] {
  return seed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3)
    .filter((part) => !["http", "https", "www", "com", "jpg", "png", "jpeg", "webp"].includes(part));
}

function deriveAdAnalysis(adHint: string): FallbackAdAnalysis {
  const keywords = extractKeywords(adHint);
  if (keywords.length === 0) {
    return DEFAULT_ANALYSIS;
  }

  const messageCore = titleCase(keywords.slice(0, 3).join(" "));
  return {
    keyMessage: `${messageCore} with measurable results`,
    targetAudience: "Visitors searching for a practical, low-friction solution",
    valuePropositions: [
      `${messageCore} focused messaging for stronger message match`,
      "Reduced friction in the first decision moment",
      "CTA clarity aligned with ad intent",
    ],
    callToAction: "Start Now",
    tone: "direct",
    dominantColors: ["#0ea5e9", "#22c55e"],
  };
}

function pickElementIndexes(contentMap: ContentMap): {
  headingIndex: number | null;
  paragraphIndex: number | null;
  ctaIndex: number | null;
  listIndex: number | null;
} {
  const heading = contentMap.elements.find((el) => /^h[1-3]$/.test(el.tag));
  const paragraph = contentMap.elements.find((el) => el.tag === "p" && el.text.length > 30);
  const cta = contentMap.elements.find((el) =>
    ["button", "a", "input"].includes(el.tag) ||
    /start|trial|demo|buy|get|sign up|book|contact/i.test(el.text)
  );
  const list = contentMap.elements.find((el) => el.tag === "li");

  return {
    headingIndex: heading?.index ?? null,
    paragraphIndex: paragraph?.index ?? null,
    ctaIndex: cta?.index ?? null,
    listIndex: list?.index ?? null,
  };
}

export function buildFallbackPersonalization(
  contentMap: ContentMap,
  adHint: string
): FallbackPersonalization {
  const adAnalysis = deriveAdAnalysis(adHint);
  const indexes = pickElementIndexes(contentMap);
  const modifications: Modification[] = [];

  const heading = contentMap.elements.find((el) => el.index === indexes.headingIndex);
  if (heading) {
    modifications.push({
      elementIndex: heading.index,
      originalText: heading.text,
      newText: `${adAnalysis.keyMessage}`,
      reason: "Message match: aligns hero headline to ad promise for lower bounce and stronger continuity.",
    });
  }

  const paragraph = contentMap.elements.find((el) => el.index === indexes.paragraphIndex);
  if (paragraph) {
    modifications.push({
      elementIndex: paragraph.index,
      originalText: paragraph.text,
      newText:
        "Built for high-intent visitors: see clear value fast, understand exactly what happens next, and move forward with confidence.",
      reason: "Value proposition emphasis: clarifies outcomes and reduces uncertainty in above-the-fold copy.",
    });
  }

  const cta = contentMap.elements.find((el) => el.index === indexes.ctaIndex);
  if (cta) {
    modifications.push({
      elementIndex: cta.index,
      originalText: cta.text,
      newText: adAnalysis.callToAction,
      reason: "CTA alignment: mirrors ad intent with a direct action phrase.",
    });
  }

  const list = contentMap.elements.find((el) => el.index === indexes.listIndex);
  if (list) {
    modifications.push({
      elementIndex: list.index,
      originalText: list.text,
      newText: "Fast setup, clear pricing, and immediate next steps.",
      reason: "CRO clarity: reframes supporting bullet into concrete conversion-friendly benefits.",
    });
  }

  const cssOverrides = `
:root {
  --ad-accent: ${adAnalysis.dominantColors[0] || "#0ea5e9"};
  --ad-accent-2: ${adAnalysis.dominantColors[1] || "#22c55e"};
}
a.cta, a.button, button, [role='button'], input[type='submit'] {
  background: var(--ad-accent) !important;
  border-color: var(--ad-accent) !important;
  color: #ffffff !important;
}
a.cta:hover, a.button:hover, button:hover, [role='button']:hover, input[type='submit']:hover {
  filter: brightness(1.05);
}
h1, h2 {
  letter-spacing: -0.01em;
}
`.trim();

  return {
    adAnalysis,
    modifications,
    cssOverrides,
    summary:
      "Fallback personalization mode applied. The page was enhanced with message match, stronger CTA clarity, and light visual tuning to keep continuity with ad intent.",
  };
}
