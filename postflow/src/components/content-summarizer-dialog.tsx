"use client";

import { useState } from "react";
import type { SummarizeResult } from "@/lib/ai";

interface Props {
  content: string;
  platforms?: string[];
  onApply: (summary: string) => void;
  onClose: () => void;
}

type Style = "narrative" | "bullet_points" | "headline";

const STYLE_OPTIONS: { value: Style; label: string; description: string }[] = [
  { value: "narrative", label: "Narrative", description: "Flowing prose summary" },
  { value: "bullet_points", label: "Bullet Points", description: "Key facts as short bullets" },
  { value: "headline", label: "Headline Only", description: "Single punchy title line" },
];

const LENGTH_PRESETS = [
  { label: "Twitter/X", value: 280 },
  { label: "Threads", value: 500 },
  { label: "LinkedIn", value: 700 },
  { label: "Instagram", value: 2200 },
];

export function ContentSummarizerDialog({ content, platforms, onApply, onClose }: Props) {
  const [targetLength, setTargetLength] = useState(280);
  const [style, setStyle] = useState<Style>("narrative");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, targetLength, style, platforms }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Summarization failed");
      } else {
        setResult((await res.json()) as SummarizeResult);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const charColor =
    result == null
      ? "text-gray-500"
      : result.charCount > targetLength
        ? "text-red-600"
        : result.charCount > targetLength * 0.9
          ? "text-amber-600"
          : "text-green-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-xl mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">✂️ Content Summarizer</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Style selector */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Style</p>
          <div className="flex gap-2 flex-wrap">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStyle(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  style === opt.value
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 hover:border-indigo-400"
                }`}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target length */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-600">Target length</p>
            <span className="text-xs text-gray-500">{targetLength} chars</span>
          </div>
          <input
            type="range"
            min={50}
            max={2200}
            step={10}
            value={targetLength}
            onChange={(e) => setTargetLength(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {LENGTH_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setTargetLength(p.value)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  targetLength === p.value
                    ? "bg-indigo-100 border-indigo-400 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:border-indigo-300"
                }`}
              >
                {p.label} ({p.value})
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Summarizing…" : result ? "Regenerate" : "Summarize"}
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Result */}
        {result && !loading && (
          <div className="space-y-3">
            {result.title && (
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                {result.title}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-600">Summary</p>
                <span className={`text-xs font-medium ${charColor}`}>
                  {result.charCount}/{targetLength}
                </span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {result.summary}
              </div>
            </div>

            {result.keyPoints.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Key Points</p>
                <ul className="space-y-1">
                  {result.keyPoints.map((point, i) => (
                    <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                      <span className="text-indigo-500 shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex-1 py-1.5 text-xs rounded border border-gray-300 hover:border-indigo-400 text-gray-700 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => onApply(result.summary)}
                className="flex-1 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Use in Composer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
