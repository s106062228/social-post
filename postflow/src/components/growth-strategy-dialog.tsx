"use client";

import { useState } from "react";
import type { GrowthStrategyResult } from "@/lib/ai";

interface Props {
  platforms: string[];
  onClose: () => void;
}

const TIMEFRAME_OPTIONS = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
] as const;

export function GrowthStrategyDialog({ platforms, onClose }: Props) {
  const [goals, setGoals] = useState("");
  const [timeframe, setTimeframe] = useState<"30d" | "90d">("30d");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(platforms);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<GrowthStrategyResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(0);

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function generate() {
    if (selectedPlatforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/growth-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selectedPlatforms, goals: goals || undefined, timeframe }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to generate growth strategy");
      } else {
        const data = (await res.json()) as { strategy: GrowthStrategyResult; generatedAt: string };
        setStrategy(data.strategy);
        setGeneratedAt(data.generatedAt);
        setExpandedWeek(0);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Growth Strategy</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Platform chips */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Platforms</p>
          <div className="flex gap-2 flex-wrap">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedPlatforms.includes(p)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 hover:border-indigo-400"
                }`}
              >
                {p}
              </button>
            ))}
            {platforms.length === 0 && (
              <p className="text-xs text-gray-400">No connected platforms</p>
            )}
          </div>
        </div>

        {/* Timeframe */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Timeframe</p>
          <div className="flex gap-2">
            {TIMEFRAME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeframe(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  timeframe === opt.value
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 hover:border-indigo-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Goals */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">
            Goals <span className="text-gray-400">(optional)</span>
          </p>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="e.g. Grow Instagram followers by 20%, increase engagement on LinkedIn…"
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:border-indigo-400"
          />
          <p className="text-xs text-gray-400 text-right">{goals.length}/500</p>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={generate}
          disabled={loading || selectedPlatforms.length === 0}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Generating…" : strategy ? "Regenerate Strategy" : "Generate Strategy"}
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Results */}
        {strategy && !loading && (
          <div className="space-y-4">
            {/* Estimated growth */}
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-0.5">
                Estimated Growth
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">{strategy.estimatedGrowth}</p>
            </div>

            {/* Overall approach */}
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                Overall Approach
              </p>
              <p className="text-sm text-indigo-800 dark:text-indigo-200">{strategy.overallApproach}</p>
            </div>

            {/* Weekly breakdown */}
            {strategy.weeks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Weekly Plan
                </p>
                <div className="space-y-2">
                  {strategy.weeks.map((week, i) => (
                    <div
                      key={week.week}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedWeek(expandedWeek === i ? null : i)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-sm font-medium">
                          Week {week.week} — {week.focus}
                        </span>
                        <span className="text-gray-400 text-xs">{expandedWeek === i ? "▲" : "▼"}</span>
                      </button>
                      {expandedWeek === i && (
                        <div className="px-3 pb-3 space-y-3">
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Tactics</p>
                            <ul className="space-y-1">
                              {week.tactics.map((t, ti) => (
                                <li key={ti} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                                  <span className="text-indigo-500 shrink-0">•</span>
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">KPIs to Track</p>
                            <ul className="space-y-1">
                              {week.kpis.map((k, ki) => (
                                <li key={ki} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                                  <span className="text-green-500 shrink-0">✓</span>
                                  {k}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Platform-specific tips */}
            {strategy.platformSpecific.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Platform Tips
                </p>
                <div className="space-y-3">
                  {strategy.platformSpecific.map((ps) => (
                    <div key={ps.platform} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                        {ps.platform}
                      </p>
                      <ul className="space-y-1">
                        {ps.tips.map((tip, ti) => (
                          <li key={ti} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
                            <span className="text-indigo-400 shrink-0">→</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generatedAt && (
              <p className="text-xs text-gray-400 text-right">
                Generated {new Date(generatedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
