import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  fetchAndProcessPage,
  extractContentMap,
  applyModifications,
  fetchImageAsBase64,
} from "@/lib/html-processor";
import { SYSTEM_PROMPT, buildUserPrompt, parseClaudeResponse } from "@/lib/prompts";
import { buildFallbackPersonalization } from "@/lib/fallback-personalizer";

export const maxDuration = 60;

function sanitizeFallbackReason(reason?: string): string | undefined {
  if (!reason) return undefined;

  if (/invalid api key/i.test(reason)) {
    return "Configured Anthropic API key is invalid.";
  }

  if (/failed to fetch image/i.test(reason) || /ad image fetch failed/i.test(reason)) {
    return "Could not fetch the ad image from the provided URL.";
  }

  if (/no anthropic api key/i.test(reason)) {
    return "No Anthropic API key was provided.";
  }

  return "AI personalization was unavailable for this request.";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const landingPageUrl = formData.get("landingPageUrl") as string;
    const adImageUrl = formData.get("adImageUrl") as string | null;
    const adImageFile = formData.get("adImage") as File | null;
    const clientApiKey = formData.get("apiKey") as string | null;
    const adHint = adImageUrl || adImageFile?.name || "";

    if (!landingPageUrl) {
      return NextResponse.json(
        { error: "Landing page URL is required" },
        { status: 400 }
      );
    }

    if (!adImageUrl && !adImageFile) {
      return NextResponse.json(
        { error: "Ad creative image is required (upload or URL)" },
        { status: 400 }
      );
    }

    // 1. Fetch and process the landing page
    let originalHtml: string;
    try {
      originalHtml = await fetchAndProcessPage(landingPageUrl);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not fetch landing page: ${err instanceof Error ? err.message : "Unknown error"}. Make sure the URL is publicly accessible.`,
        },
        { status: 400 }
      );
    }

    // 2. Extract content map
    const contentMap = extractContentMap(originalHtml);

    if (contentMap.elements.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not extract content from the landing page. The page might be a single-page app that requires JavaScript to render.",
        },
        { status: 400 }
      );
    }

    // Resolve API key: server env var > client-provided
    const apiKey = process.env.ANTHROPIC_API_KEY || clientApiKey;

    const buildFallbackResponse = (reason?: string) => {
      const fallback = buildFallbackPersonalization(contentMap, adHint);
      const modifiedHtml = applyModifications(
        originalHtml,
        fallback.modifications,
        fallback.cssOverrides
      );
      const fallbackReason = sanitizeFallbackReason(reason);

      return NextResponse.json({
        originalHtml,
        modifiedHtml,
        analysis: fallback.adAnalysis,
        modifications: fallback.modifications,
        cssOverrides: fallback.cssOverrides,
        summary: fallback.summary,
        fallbackReason,
        demoMode: true,
      });
    };

    // Fallback mode keeps the demo usable without external credentials.
    if (!apiKey) {
      return buildFallbackResponse("No Anthropic API key detected.");
    }

    // 3. Prepare ad image as base64
    let imageBase64: string;
    let imageMediaType: string;

    if (adImageFile) {
      const buffer = await adImageFile.arrayBuffer();
      imageBase64 = Buffer.from(buffer).toString("base64");
      imageMediaType = adImageFile.type || "image/png";
    } else if (adImageUrl) {
      try {
        const result = await fetchImageAsBase64(adImageUrl);
        imageBase64 = result.base64;
        imageMediaType = result.mediaType;
      } catch (err) {
        return buildFallbackResponse(
          `Ad image fetch failed (${err instanceof Error ? err.message : "Unknown error"}).`
        );
      }
    } else {
      return NextResponse.json(
        { error: "No ad image provided" },
        { status: 400 }
      );
    }

    // Validate media type for Claude's vision API
    const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    type ValidMediaType = typeof validMediaTypes[number];
    if (!validMediaTypes.includes(imageMediaType as ValidMediaType)) {
      imageMediaType = "image/png";
    }

    // 4. Call Claude API
    const client = new Anthropic({ apiKey });

    const userPrompt = buildUserPrompt(contentMap);

    let message;
    try {
      message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageMediaType as ValidMediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
      });
    } catch (err) {
      const reason =
        err instanceof Anthropic.APIError
          ? `Anthropic API ${err.status || "error"}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown AI request error";
      return buildFallbackResponse(reason);
    }

    // Extract text response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!responseText) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // 5. Parse the response
    let parsed;
    try {
      parsed = parseClaudeResponse(responseText);
    } catch (err) {
      console.error("Failed to parse Claude response:", responseText);
      return NextResponse.json(
        {
          error: `Failed to parse AI response: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    // 6. Apply modifications to the HTML
    const modifiedHtml = applyModifications(
      originalHtml,
      parsed.modifications,
      parsed.cssOverrides
    );

    // 7. Return result
    return NextResponse.json({
      originalHtml,
      modifiedHtml,
      analysis: parsed.adAnalysis,
      modifications: parsed.modifications,
      cssOverrides: parsed.cssOverrides,
      summary: parsed.summary,
    });
  } catch (err) {
    console.error("Personalization error:", err);

    return NextResponse.json(
      {
        error: `Unexpected error: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Check if server-side API key is configured
  const hasServerKey = !!process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    hasServerKey,
    fallbackAvailable: true,
  });
}
