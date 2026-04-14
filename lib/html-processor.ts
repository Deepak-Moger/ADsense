import * as cheerio from "cheerio";
import type { Element } from "domhandler";

interface ContentMapEntry {
  index: number;
  tag: string;
  text: string;
  context: string;
  href?: string;
  src?: string;
}

export interface ContentMap {
  title: string;
  metaDescription: string;
  elements: ContentMapEntry[];
}

export interface Modification {
  elementIndex: number;
  originalText: string;
  newText: string;
  reason: string;
}

/**
 * Fetch a landing page and rewrite relative URLs to absolute.
 */
export async function fetchAndProcessPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return rewriteRelativeUrls(html, url);
}

/**
 * Rewrite relative URLs in HTML to absolute URLs based on the page's origin.
 */
function rewriteRelativeUrls(html: string, pageUrl: string): string {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);

  // Check for <base> tag
  const baseHref = $("base").attr("href");
  if (baseHref) {
    try {
      const baseUrl = new URL(baseHref, base);
      base.href = baseUrl.href;
    } catch {}
  }

  const resolve = (relative: string | undefined): string | undefined => {
    if (!relative) return relative;
    if (
      relative.startsWith("http://") ||
      relative.startsWith("https://") ||
      relative.startsWith("//") ||
      relative.startsWith("data:") ||
      relative.startsWith("mailto:") ||
      relative.startsWith("tel:") ||
      relative.startsWith("javascript:") ||
      relative.startsWith("#")
    ) {
      return relative;
    }
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  };

  // Rewrite src, href, action, poster attributes
  $("[src]").each((_, el) => {
    const $el = $(el);
    $el.attr("src", resolve($el.attr("src")));
  });
  $("[href]").each((_, el) => {
    const $el = $(el);
    $el.attr("href", resolve($el.attr("href")));
  });
  $("[action]").each((_, el) => {
    const $el = $(el);
    $el.attr("action", resolve($el.attr("action")));
  });
  $("[poster]").each((_, el) => {
    const $el = $(el);
    $el.attr("poster", resolve($el.attr("poster")));
  });

  // Rewrite srcset
  $("[srcset]").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (srcset) {
      const rewritten = srcset
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          if (parts[0]) parts[0] = resolve(parts[0]) || parts[0];
          return parts.join(" ");
        })
        .join(", ");
      $el.attr("srcset", rewritten);
    }
  });

  // Rewrite CSS url() in inline styles
  $("[style]").each((_, el) => {
    const $el = $(el);
    const style = $el.attr("style");
    if (style) {
      const rewritten = style.replace(
        /url\(['"]?([^'")]+)['"]?\)/g,
        (match, urlStr) => {
          const resolved = resolve(urlStr);
          return `url('${resolved}')`;
        }
      );
      $el.attr("style", rewritten);
    }
  });

  return $.html();
}

/**
 * Extract key text content from HTML as a structured content map.
 * This is what gets sent to Claude (not the full HTML).
 */
export function extractContentMap(html: string): ContentMap {
  const $ = cheerio.load(html);
  const elements: ContentMapEntry[] = [];
  let index = 0;

  const title = $("title").text().trim();
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || "";

  // Helper to determine context (section of page)
  const getContext = (el: Element): string => {
    const $el = $(el);
    const parent = $el.closest(
      "header, nav, main, footer, section, aside, article"
    );
    if (parent.length) {
      const tag = parent.prop("tagName")?.toLowerCase() || "";
      const id = parent.attr("id") || "";
      const cls = parent.attr("class")?.split(" ").slice(0, 2).join(".") || "";
      return [tag, id, cls].filter(Boolean).join(" ");
    }
    return "body";
  };

  // Extract headings
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 1) {
      elements.push({
        index: index++,
        tag: el.tagName.toLowerCase(),
        text,
        context: getContext(el),
      });
    }
  });

  // Extract paragraphs (limit to first 30 meaningful ones)
  let pCount = 0;
  $("p").each((_, el) => {
    if (pCount >= 30) return;
    const text = $(el).text().trim();
    if (text && text.length > 10) {
      elements.push({
        index: index++,
        tag: "p",
        text: text.length > 300 ? text.slice(0, 300) + "..." : text,
        context: getContext(el),
      });
      pCount++;
    }
  });

  // Extract buttons and CTAs
  $("button, a.btn, a.cta, a.button, [role='button'], input[type='submit']").each(
    (_, el) => {
      const $el = $(el);
      const text =
        $el.text().trim() || $el.attr("value")?.trim() || "";
      if (text && text.length > 1 && text.length < 100) {
        elements.push({
          index: index++,
          tag: el.tagName.toLowerCase(),
          text,
          context: getContext(el),
          href: $el.attr("href"),
        });
      }
    }
  );

  // Extract standalone links (nav links, important links)
  $("a").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (
      text &&
      text.length > 2 &&
      text.length < 80 &&
      !$el.is(".btn, .cta, .button, [role='button']")
    ) {
      // Only include links that look like CTAs or important nav items
      const href = $el.attr("href") || "";
      const classes = $el.attr("class") || "";
      if (
        classes.match(/cta|action|signup|trial|demo|start|hero/i) ||
        href.match(/signup|register|trial|demo|pricing|contact/i)
      ) {
        elements.push({
          index: index++,
          tag: "a",
          text,
          context: getContext(el),
          href,
        });
      }
    }
  });

  // Extract list items in key sections (features, benefits)
  $("ul li, ol li").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const context = getContext(el);
    if (
      text &&
      text.length > 5 &&
      text.length < 200 &&
      elements.length < 80
    ) {
      elements.push({
        index: index++,
        tag: "li",
        text: text.length > 200 ? text.slice(0, 200) + "..." : text,
        context,
      });
    }
  });

  // Extract image alt texts
  $("img[alt]").each((_, el) => {
    const alt = $(el).attr("alt")?.trim();
    if (alt && alt.length > 3) {
      elements.push({
        index: index++,
        tag: "img",
        text: `[alt: ${alt}]`,
        context: getContext(el),
        src: $(el).attr("src"),
      });
    }
  });

  return { title, metaDescription, elements };
}

/**
 * Apply Claude's modifications to the original HTML.
 */
export function applyModifications(
  html: string,
  modifications: Modification[],
  cssOverrides: string
): string {
  let modified = html;

  // Apply text replacements
  for (const mod of modifications) {
    if (mod.originalText && mod.newText && mod.originalText !== mod.newText) {
      // Escape special regex characters in the original text
      const escaped = mod.originalText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Replace only the first occurrence
      const regex = new RegExp(escaped);
      modified = modified.replace(regex, mod.newText);
    }
  }

  // Inject CSS overrides
  if (cssOverrides && cssOverrides.trim()) {
    const styleTag = `\n<style id="ad-personalization-overrides">\n${cssOverrides}\n</style>\n`;
    if (modified.includes("</head>")) {
      modified = modified.replace("</head>", `${styleTag}</head>`);
    } else {
      modified = styleTag + modified;
    }
  }

  return modified;
}

/**
 * Fetch an image from URL and return as base64 data URI.
 */
export async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(imageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // Normalize media type
  let mediaType = contentType.split(";")[0].trim();
  if (!mediaType.startsWith("image/")) {
    mediaType = "image/png";
  }

  return { base64, mediaType };
}
