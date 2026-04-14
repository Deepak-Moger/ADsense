"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Modification {
  elementIndex: number;
  originalText: string;
  newText: string;
  reason: string;
}

interface AdAnalysis {
  keyMessage: string;
  targetAudience: string;
  valuePropositions: string[];
  callToAction: string;
  tone: string;
  dominantColors: string[];
}

interface PersonalizationResult {
  originalHtml: string;
  modifiedHtml: string;
  analysis: AdAnalysis;
  modifications: Modification[];
  cssOverrides: string;
  summary: string;
  fallbackReason?: string;
  demoMode?: boolean;
}

type AppState = "input" | "loading" | "result";
type AdInputType = "url" | "upload";

const LOADING_MESSAGES = [
  "Fetching your landing page...",
  "Analyzing the ad creative...",
  "Identifying key messaging and CTAs...",
  "Applying CRO best practices...",
  "Personalizing the landing page...",
  "Almost there — finalizing modifications...",
];

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [adInputType, setAdInputType] = useState<AdInputType>("url");
  const [adImageUrl, setAdImageUrl] = useState("");
  const [adImageFile, setAdImageFile] = useState<File | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasServerKey, setHasServerKey] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PersonalizationResult | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [previewMode, setPreviewMode] = useState<"original" | "personalized">(
    "personalized"
  );
  const [activeTab, setActiveTab] = useState<"preview" | "changes" | "analysis">(
    "preview"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if server has API key configured
  useEffect(() => {
    fetch("/api/personalize")
      .then((r) => r.json())
      .then((data) => setHasServerKey(!!data.hasServerKey))
      .catch(() => setHasServerKey(false));
  }, []);

  // Cycle loading messages
  useEffect(() => {
    if (state !== "loading") return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[i]);
    }, 4000);
    return () => clearInterval(interval);
  }, [state]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setAdImageFile(file);
        const reader = new FileReader();
        reader.onload = () => setAdImagePreview(reader.result as string);
        reader.readAsDataURL(file);
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setState("loading");
      setLoadingMessage(LOADING_MESSAGES[0]);

      try {
        const formData = new FormData();
        formData.append("landingPageUrl", landingPageUrl);

        if (adInputType === "upload" && adImageFile) {
          formData.append("adImage", adImageFile);
        } else if (adInputType === "url" && adImageUrl) {
          formData.append("adImageUrl", adImageUrl);
        } else {
          throw new Error("Please provide an ad creative image");
        }

        if (apiKey) {
          formData.append("apiKey", apiKey);
        }

        const res = await fetch("/api/personalize", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Something went wrong");
        }

        setResult(data);
        setState("result");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setState("input");
      }
    },
    [landingPageUrl, adInputType, adImageFile, adImageUrl, apiKey]
  );

  const handleReset = useCallback(() => {
    setState("input");
    setResult(null);
    setPreviewMode("personalized");
    setActiveTab("preview");
    setError("");
  }, []);

  // ── INPUT STATE ──────────────────────────────────────────────
  if (state === "input") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl animate-slide-up">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">
              <span className="text-[var(--accent)]">Ad</span>Sync
            </h1>
            <p className="text-[var(--text-muted)] text-lg">
              Personalize landing pages to match your ad creatives
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-6"
          >
            {/* Ad Creative Input */}
            <div>
              <label className="block text-sm font-medium mb-3">
                Ad Creative
              </label>

              {/* Toggle */}
              <div className="flex gap-1 mb-4 bg-[var(--bg)] rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setAdInputType("url")}
                  className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                    adInputType === "url"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  Image URL
                </button>
                <button
                  type="button"
                  onClick={() => setAdInputType("upload")}
                  className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                    adInputType === "upload"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  Upload
                </button>
              </div>

              {adInputType === "url" ? (
                <input
                  type="url"
                  placeholder="https://example.com/ad-image.png"
                  value={adImageUrl}
                  onChange={(e) => setAdImageUrl(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-4 py-8 border-2 border-dashed border-[var(--border)] rounded-lg text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-white transition-colors"
                  >
                    {adImageFile ? (
                      <div className="flex flex-col items-center gap-2">
                        {adImagePreview && (
                          <img
                            src={adImagePreview}
                            alt="Ad preview"
                            className="max-h-32 rounded"
                          />
                        )}
                        <span className="text-sm">{adImageFile.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <svg
                          className="w-8 h-8"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span>Click to upload ad image</span>
                      </div>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Landing Page URL */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Landing Page URL
              </label>
              <input
                type="url"
                required
                placeholder="https://example.com/landing-page"
                value={landingPageUrl}
                onChange={(e) => setLandingPageUrl(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            {/* Optional API key */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Anthropic API Key
                <span className="text-[var(--text-muted)] font-normal ml-2">
                  (optional: enables vision-based personalization)
                </span>
              </label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono text-sm"
              />
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {hasServerKey
                  ? "Server API key is configured (validated only at request time). You can leave this empty."
                  : "No server API key detected. Leave empty to run built-in demo mode."}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={
                !landingPageUrl ||
                (adInputType === "url" ? !adImageUrl : !adImageFile)
              }
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Personalize Landing Page
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-[var(--text-muted)] text-xs mt-4">
            Powered by Claude AI &middot; Applies CRO best practices to match
            your ad with the landing page
          </p>
        </div>
      </div>
    );
  }

  // ── LOADING STATE ────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center animate-slide-up">
          <div className="flex justify-center gap-2 mb-6">
            <div className="loading-dot w-3 h-3 bg-[var(--accent)] rounded-full" />
            <div className="loading-dot w-3 h-3 bg-[var(--accent)] rounded-full" />
            <div className="loading-dot w-3 h-3 bg-[var(--accent)] rounded-full" />
          </div>
          <p className="text-lg text-[var(--text-muted)] transition-all duration-500">
            {loadingMessage}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-2 opacity-60">
            This usually takes 15-30 seconds
          </p>
        </div>
      </div>
    );
  }

  // ── RESULT STATE ─────────────────────────────────────────────
  if (!result) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Start Over
        </button>
        <h1 className="text-lg font-semibold">
          <span className="text-[var(--accent)]">Ad</span>Sync Results
        </h1>
        <div className="w-24" />
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-2">
        {(["preview", "changes", "analysis"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {tab === "changes"
              ? `Changes (${result.modifications.length})`
              : tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-6 pb-6 pt-2">
        {/* Preview Tab */}
        {activeTab === "preview" && (
          <div className="animate-slide-up">
            {/* Toggle */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
                <button
                  onClick={() => setPreviewMode("original")}
                  className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                    previewMode === "original"
                      ? "bg-[var(--surface-2)] text-white"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setPreviewMode("personalized")}
                  className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                    previewMode === "personalized"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  Personalized
                </button>
              </div>
            </div>

            {/* Summary bar */}
            <div className="mb-4 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-muted)]">
              {result.summary}
            </div>

            {result.demoMode && (
              <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
                Demo mode result: personalization was generated with local CRO fallback rules. Add an Anthropic API key for image-aware personalization.
                {result.fallbackReason && (
                  <p className="mt-2 text-amber-200/90">
                    Reason: {result.fallbackReason}
                  </p>
                )}
              </div>
            )}

            {/* iframe preview */}
            <iframe
              srcDoc={
                previewMode === "original"
                  ? result.originalHtml
                  : result.modifiedHtml
              }
              sandbox="allow-same-origin"
              className="preview-frame"
              title={`${previewMode} page preview`}
            />
          </div>
        )}

        {/* Changes Tab */}
        {activeTab === "changes" && (
          <div className="animate-slide-up max-w-4xl mx-auto space-y-4">
            {result.modifications.map((mod, i) => (
              <div
                key={i}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-muted)] mb-2 italic">
                      {mod.reason}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="px-3 py-2 bg-red-500/5 border border-red-500/20 rounded text-sm">
                        <span className="text-red-400 text-xs font-medium block mb-1">
                          Original
                        </span>
                        <span className="text-[var(--text)]">
                          {mod.originalText}
                        </span>
                      </div>
                      <div className="px-3 py-2 bg-green-500/5 border border-green-500/20 rounded text-sm">
                        <span className="text-green-400 text-xs font-medium block mb-1">
                          Personalized
                        </span>
                        <span className="text-[var(--text)]">
                          {mod.newText}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {result.cssOverrides && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2 text-[var(--accent)]">
                  CSS Overrides Applied
                </h3>
                <pre className="text-xs text-[var(--text-muted)] bg-[var(--bg)] p-3 rounded overflow-x-auto">
                  {result.cssOverrides}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Analysis Tab */}
        {activeTab === "analysis" && (
          <div className="animate-slide-up max-w-3xl mx-auto">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 space-y-5">
              <h2 className="text-lg font-semibold">Ad Creative Analysis</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    Key Message
                  </h3>
                  <p>{result.analysis.keyMessage}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    Target Audience
                  </h3>
                  <p>{result.analysis.targetAudience}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    Call to Action
                  </h3>
                  <p>{result.analysis.callToAction}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    Tone
                  </h3>
                  <p className="capitalize">{result.analysis.tone}</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Value Propositions
                </h3>
                <ul className="space-y-1">
                  {result.analysis.valuePropositions.map((vp, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-[var(--accent)] mt-0.5">
                        &bull;
                      </span>
                      {vp}
                    </li>
                  ))}
                </ul>
              </div>

              {result.analysis.dominantColors?.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                    Dominant Colors
                  </h3>
                  <div className="flex gap-2">
                    {result.analysis.dominantColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border border-[var(--border)]"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-mono text-[var(--text-muted)]">
                          {color}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
