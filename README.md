# AdSync: Ad-to-Landing Page Personalization Demo

AdSync is a simple AI workflow where a user can:

1. Input an ad creative (image URL or upload)
2. Input a landing page URL
3. Generate a personalized version of the same landing page

Important: the system enhances the existing page (message match, CTA clarity, visual tuning) instead of generating a completely new page.

## Live Demo

Local demo:

1. Run npm install
2. Run npm run dev
3. Open http://localhost:3000

Public demo (recommended for reviewers): deploy this repository to Vercel and share the generated deployment URL.

## Brief Explanation (Google Doc)

Add your Google Doc link here:

- Google Doc: TODO - paste shareable link

Suggested Google Doc sections:

1. Problem statement
2. Input/output contract
3. Architecture and design choices
4. Reliability and failure handling
5. Demo walkthrough with screenshots

## How The System Works (Flow)

1. User submits ad creative + landing page URL from the UI.
2. API fetches and normalizes landing page HTML.
3. Processor extracts editable text elements and structure.
4. Personalization engine runs:
  - AI mode (when API key is valid): vision + structured personalization
  - Fallback mode (when AI is unavailable): deterministic CRO personalization
5. System applies targeted text/CSS modifications to the original HTML.
6. UI renders:
  - Original vs personalized preview
  - Change list with reasons
  - Ad analysis summary

## Key Components / Agent Design

1. Frontend application
  - File: app/page.tsx
  - Responsibilities: collect inputs, call API, render previews, changes, analysis.

2. Personalization API
  - File: app/api/personalize/route.ts
  - Responsibilities: validate input, fetch page, route to AI or fallback, return structured result.

3. HTML processing layer
  - File: lib/html-processor.ts
  - Responsibilities: fetch and sanitize HTML, extract content map, apply safe modifications.

4. Prompt and output contract layer
  - File: lib/prompts.ts
  - Responsibilities: enforce structured AI output format and parser behavior.

5. Fallback personalizer
  - File: lib/fallback-personalizer.ts
  - Responsibilities: deterministic message-match and CRO-safe updates when AI path fails.

## How We Handle Random Changes

1. Structure-aware edits
  - Edits are applied by element index and content map, not blind full-page replacement.

2. Conservative scope
  - Only high-impact conversion elements are changed (headline, paragraph, CTA, light style overrides).

3. Deterministic fallback
  - If AI output is unavailable or invalid, fallback guarantees stable, predictable output.

## How We Handle Broken UI

1. Non-destructive preview model
  - Original HTML is always preserved and can be toggled instantly.

2. Defensive error handling
  - Invalid URL, fetch failures, unsupported rendering, and API failures return user-safe messages.

3. Graceful degradation
  - AI failures automatically switch to fallback mode rather than stopping the workflow.

4. CSS override boundaries
  - Visual personalization uses lightweight overrides to reduce risk of layout breakage.

## How We Handle Hallucinations

1. Strict output contract
  - AI response must conform to a parseable schema (analysis + explicit modifications).

2. Parse-time safeguards
  - Non-conforming AI output is rejected.

3. Bounded modifications
  - Changes are constrained to extracted page elements; no arbitrary DOM regeneration.

4. Automatic fallback on AI errors
  - If output is invalid or AI call fails, deterministic fallback is used.

## How We Handle Inconsistent Outputs

1. Stable fallback path
  - A deterministic rule-based engine keeps output consistent across repeated runs.

2. Exposed modification log
  - Every change includes original text, personalized text, and reason for traceability.

3. Summary + mode flags
  - Response includes summary, demo mode status, and sanitized fallback reason for transparency.

## Assumptions

1. Landing page URL is publicly accessible and returns HTML.
2. Best quality requires a valid Anthropic API key.
3. Without a valid key, the demo still works in fallback mode.

## Deployment Notes

To generate a reviewer-friendly public link:

1. Push repository to GitHub.
2. Import into Vercel.
3. Configure environment variable ANTHROPIC_API_KEY (optional but recommended).
4. Deploy and share the Vercel URL.
