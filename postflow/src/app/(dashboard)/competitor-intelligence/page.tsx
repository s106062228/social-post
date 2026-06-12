"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Brain, TrendingUp, AlertCircle, Lightbulb, Users, Wand2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface CompetitorAnalysisResult {
  contentStrategy: string;
  strengths: string[];
  weaknesses: string[];
  keyTechniques: string[];
  toneStyle: string;
  targetAudience: string;
  estimatedEngagementScore: number;
  actionableInsights: string[];
}

interface Analysis {
  id: string;
  competitorName: string;
  platform: string | null;
  content: string;
  analysis: CompetitorAnalysisResult;
  createdAt: string;
}

const PLATFORMS = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
  "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM",
  "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST",
  "DEVTO", "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
];

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

export default function CompetitorIntelligencePage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);

  const [competitorName, setCompetitorName] = useState("");
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState("");

  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch("/api/competitor-intelligence");
      if (res.ok) {
        const data = (await res.json()) as { analyses: Analysis[] };
        setAnalyses(data.analyses);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAnalyses(); }, [fetchAnalyses]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!competitorName.trim() || content.trim().length < 10) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/competitor-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorName, content, platform: platform || null }),
      });
      if (res.status === 503) {
        toast({ title: "AI not configured", description: "Set ANTHROPIC_API_KEY to enable competitor analysis.", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        toast({ title: "Analysis failed", variant: "destructive" });
        return;
      }
      const newAnalysis = (await res.json()) as Analysis;
      setAnalyses((prev) => [newAnalysis, ...prev]);
      setSelectedAnalysis(newAnalysis);
      setCompetitorName("");
      setContent("");
      setPlatform("");
      toast({ title: "Analysis complete" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/competitor-intelligence/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      if (selectedAnalysis?.id === id) setSelectedAnalysis(null);
      toast({ title: "Deleted" });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Competitor Intelligence</h1>
          <p className="text-sm text-muted-foreground">Analyze competitor content with AI to uncover strategy insights</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Analysis Form */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Analyze Competitor Content
          </h2>
          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Competitor Name *</label>
              <input
                type="text"
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={100}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Platform (optional)</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Any platform</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Post Content * <span className="text-muted-foreground">({content.length}/10000)</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the competitor's post content here..."
                rows={6}
                maxLength={10000}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !competitorName.trim() || content.trim().length < 10}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Analyzing..." : "Analyze Content"}
            </button>
          </form>
        </div>

        {/* Analysis Result */}
        <div className="rounded-lg border bg-card p-5">
          {selectedAnalysis ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{selectedAnalysis.competitorName}</h2>
                <div className="flex items-center gap-2">
                  {selectedAnalysis.platform && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {selectedAnalysis.platform.replace(/_/g, " ")}
                    </span>
                  )}
                  <span className={`text-2xl font-bold ${scoreColor(selectedAnalysis.analysis.estimatedEngagementScore)}`}>
                    {selectedAnalysis.analysis.estimatedEngagementScore}/100
                  </span>
                </div>
              </div>

              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${scoreBarColor(selectedAnalysis.analysis.estimatedEngagementScore)}`}
                  style={{ width: `${selectedAnalysis.analysis.estimatedEngagementScore}%` }}
                />
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Content Strategy</p>
                  <p className="text-muted-foreground mt-0.5">{selectedAnalysis.analysis.contentStrategy}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-medium text-green-600">Strengths</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {selectedAnalysis.analysis.strengths.map((s, i) => (
                        <li key={i} className="text-muted-foreground">• {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-red-600">Weaknesses</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {selectedAnalysis.analysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-muted-foreground">• {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <p className="font-medium">Key Techniques</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedAnalysis.analysis.keyTechniques.map((t, i) => (
                      <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-medium flex items-center gap-1"><Users className="h-3 w-3" /> Target Audience</p>
                    <p className="text-muted-foreground mt-0.5">{selectedAnalysis.analysis.targetAudience}</p>
                  </div>
                  <div>
                    <p className="font-medium">Tone & Style</p>
                    <p className="text-muted-foreground mt-0.5">{selectedAnalysis.analysis.toneStyle}</p>
                  </div>
                </div>

                <div>
                  <p className="font-medium flex items-center gap-1"><Lightbulb className="h-4 w-4 text-yellow-500" /> Actionable Insights</p>
                  <ul className="mt-1 space-y-1">
                    {selectedAnalysis.analysis.actionableInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-2">
              <AlertCircle className="h-8 w-8 opacity-30" />
              <p>Submit competitor content to see analysis here</p>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold mb-4">Analysis History ({analyses.length})</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : analyses.length === 0 ? (
          <div className="text-sm text-muted-foreground">No analyses yet. Analyze your first competitor post above.</div>
        ) : (
          <div className="space-y-2">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                className={`flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedAnalysis?.id === analysis.id ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setSelectedAnalysis(analysis)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{analysis.competitorName}</p>
                    {analysis.platform && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs shrink-0">
                        {analysis.platform.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{analysis.content}</p>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  <span className={`text-sm font-semibold ${scoreColor(analysis.analysis.estimatedEngagementScore)}`}>
                    {analysis.analysis.estimatedEngagementScore}/100
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDelete(analysis.id); }}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
