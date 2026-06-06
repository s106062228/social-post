"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Users,
  BarChart2,
  Layers,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuditScoreRing } from "@/components/audit-score-ring";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditReport {
  id: string;
  period: string;
  generatedAt: string;
  overallScore: number;
  overallGrade: string;
  accountHealth: AccountHealthEntry[];
  contentMix: { total: number; categories: ContentMixCategory[] };
  postingPatterns: { platforms: PostingPattern[]; overallPacingScore: number };
  engagementBenchmarks: BenchmarkComparison[];
  consistencyScore: { score: number; streak: number; avgPostsPerWeek: number; gaps: ContentGap[] };
  topContent: TopContentItem[];
  recommendations: string[];
}

interface AccountHealthEntry {
  accountId: string;
  accountName: string;
  platform: string;
  isActive: boolean;
  healthScore: number;
  healthLabel: string;
  metrics: {
    postsPublished30d: number;
    avgEngagementRate: number;
    followerGrowth30d: number | null;
    lastPublishedAt: string | null;
    daysSinceLastPost: number | null;
  };
}

interface ContentMixCategory {
  category: string;
  count: number;
  percentage: number;
  avgEngagement: number;
}

interface PostingPattern {
  platform: string;
  actualPerWeek: number;
  recommendedPerWeek: number;
  pacingScore: number;
  status: string;
  totalPublished: number;
}

interface BenchmarkComparison {
  platform: string;
  yourRate: number;
  benchmarkRate: number;
  diffPct: number;
  performance: string;
  sampleSize: number;
}

interface ContentGap {
  startDate: string;
  endDate: string;
  days: number;
}

interface TopContentItem {
  postId: string;
  contentPreview: string;
  score: number;
  platforms: string[];
}

interface PastAuditSummary {
  id: string;
  period: string;
  generatedAt: string;
  overallScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function performanceBadge(performance: string) {
  if (performance === "above") return <Badge variant="success">Above</Badge>;
  if (performance === "below") return <Badge variant="destructive">Below</Badge>;
  if (performance === "insufficient") return <Badge variant="secondary">Not enough data</Badge>;
  return <Badge variant="secondary">At benchmark</Badge>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AuditReportsClient() {
  const [running, setRunning] = useState(false);
  const [currentReport, setCurrentReport] = useState<AuditReport | null>(null);
  const [pastReports, setPastReports] = useState<PastAuditSummary[]>([]);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [showSections, setShowSections] = useState<Record<string, boolean>>({
    accounts: true,
    content: false,
    patterns: false,
    benchmarks: false,
    consistency: false,
    topContent: false,
  });

  const toggleSection = (key: string) => {
    setShowSections((prev: Record<string, boolean>) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadPastReports = useCallback(async () => {
    if (pastLoaded) return;
    try {
      const res = await fetch("/api/analytics/audit");
      if (res.ok) {
        const data = await res.json();
        setPastReports(data.reports ?? []);
      }
    } finally {
      setPastLoaded(true);
    }
  }, [pastLoaded]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/analytics/audit", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to run audit");
      }
      const report = (await res.json()) as AuditReport;
      setCurrentReport(report);
      setPastLoaded(false); // reload list
      toast.success("Audit complete!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setRunning(false);
    }
  };

  const loadPastReport = async (id: string) => {
    try {
      const res = await fetch(`/api/analytics/audit/${id}`);
      if (!res.ok) throw new Error("Failed to load report");
      const report = (await res.json()) as AuditReport;
      setCurrentReport(report);
    } catch {
      toast.error("Failed to load report");
    }
  };

  // Lazy-load past reports
  if (!pastLoaded) {
    loadPastReports();
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Run a full audit to get an overall score, content analysis, and personalised recommendations.
        </p>
        <Button onClick={runAudit} disabled={running} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Running Audit…" : "Run New Audit"}
        </Button>
      </div>

      {/* Current report */}
      {currentReport ? (
        <div className="space-y-4">
          {/* Overall score header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <AuditScoreRing score={currentReport.overallScore} />
                <div className="flex-1 space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold">Overall Audit Score</h2>
                    <p className="text-sm text-muted-foreground">
                      Generated {format(new Date(currentReport.generatedAt), "PPP 'at' p")} · 30-day period
                    </p>
                  </div>
                  {/* Recommendations */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" /> Recommendations
                    </h3>
                    <ul className="space-y-1.5">
                      {currentReport.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Account Health */}
          <SectionCard
            icon={<Users className="h-4 w-4" />}
            title="Account Health"
            open={showSections.accounts}
            onToggle={() => toggleSection("accounts")}
          >
            {currentReport.accountHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts connected.</p>
            ) : (
              <div className="divide-y">
                {currentReport.accountHealth.map((acct) => (
                  <div key={acct.accountId} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium">{acct.accountName}</span>
                      <span className="ml-2 text-muted-foreground">{acct.platform}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{acct.metrics.postsPublished30d} posts/30d</span>
                      <span className={`font-semibold ${scoreColor(acct.healthScore)}`}>
                        {acct.healthScore} — {acct.healthLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section: Content Mix */}
          <SectionCard
            icon={<Layers className="h-4 w-4" />}
            title={`Content Mix (${currentReport.contentMix.total} posts)`}
            open={showSections.content}
            onToggle={() => toggleSection("content")}
          >
            {currentReport.contentMix.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published posts in this period.</p>
            ) : (
              <div className="space-y-2">
                {currentReport.contentMix.categories.map((cat) => (
                  <div key={cat.category} className="flex items-center gap-3 text-sm">
                    <div className="w-32 truncate font-medium">{cat.category}</div>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                    <div className="w-16 text-right text-muted-foreground">{cat.percentage}%</div>
                    <div className="w-20 text-right text-muted-foreground">
                      {cat.count} post{cat.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section: Posting Patterns */}
          <SectionCard
            icon={<TrendingUp className="h-4 w-4" />}
            title={`Posting Frequency (Pacing Score: ${currentReport.postingPatterns.overallPacingScore})`}
            open={showSections.patterns}
            onToggle={() => toggleSection("patterns")}
          >
            {currentReport.postingPatterns.platforms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published posts in this period.</p>
            ) : (
              <div className="divide-y">
                {currentReport.postingPatterns.platforms.map((p) => (
                  <div key={p.platform} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{p.platform}</span>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{p.actualPerWeek.toFixed(1)}/{p.recommendedPerWeek} per week</span>
                      <Badge
                        variant={p.status === "optimal" ? "default" : "secondary"}
                        className={p.status === "under" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : ""}
                      >
                        {p.status}
                      </Badge>
                      <span className={`font-semibold ${scoreColor(p.pacingScore)}`}>{p.pacingScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section: Benchmarks */}
          <SectionCard
            icon={<BarChart2 className="h-4 w-4" />}
            title="Engagement vs Industry Benchmarks"
            open={showSections.benchmarks}
            onToggle={() => toggleSection("benchmarks")}
          >
            {currentReport.engagementBenchmarks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough data to compare benchmarks.</p>
            ) : (
              <div className="divide-y">
                {currentReport.engagementBenchmarks.map((b) => (
                  <div key={b.platform} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{b.platform}</span>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>You: {b.yourRate.toFixed(2)}%</span>
                      <span>Benchmark: {b.benchmarkRate.toFixed(2)}%</span>
                      {performanceBadge(b.performance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section: Consistency */}
          <SectionCard
            icon={<TrendingUp className="h-4 w-4" />}
            title={`Consistency Score: ${currentReport.consistencyScore.score}/100`}
            open={showSections.consistency}
            onToggle={() => toggleSection("consistency")}
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${currentReport.consistencyScore.score}%` }}
                  />
                </div>
                <span className="font-semibold w-12 text-right">{currentReport.consistencyScore.score}</span>
              </div>
              <div className="flex gap-6 text-muted-foreground">
                <span>Streak: <strong className="text-foreground">{currentReport.consistencyScore.streak} weeks</strong></span>
                <span>Avg posts/week: <strong className="text-foreground">{currentReport.consistencyScore.avgPostsPerWeek.toFixed(1)}</strong></span>
                <span>Gaps: <strong className="text-foreground">{currentReport.consistencyScore.gaps.length}</strong></span>
              </div>
              {currentReport.consistencyScore.gaps.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium">Content Gaps:</p>
                  {currentReport.consistencyScore.gaps.map((gap, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-muted-foreground">
                        {format(new Date(gap.startDate), "MMM d")} – {format(new Date(gap.endDate), "MMM d")} ({gap.days} days)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Section: Top Content */}
          <SectionCard
            icon={<TrendingUp className="h-4 w-4" />}
            title="Top Performing Posts"
            open={showSections.topContent}
            onToggle={() => toggleSection("topContent")}
          >
            {currentReport.topContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engagement data available yet.</p>
            ) : (
              <div className="space-y-2">
                {currentReport.topContent.map((item, i) => (
                  <div key={item.postId} className="flex items-start gap-3 text-sm">
                    <span className="w-5 shrink-0 font-bold text-muted-foreground">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.contentPreview}</p>
                      <p className="text-muted-foreground">{item.platforms.join(", ")}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-primary">{item.score} pts</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <ClipboardListIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="text-lg font-medium">No audit report yet</p>
            <p className="text-sm text-muted-foreground">
              Click &quot;Run New Audit&quot; to generate a comprehensive analysis of your social media performance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Past Audit History */}
      {pastReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Audit History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pastReports.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2">
                  <div className="text-sm">
                    <span className="font-medium">{r.period} period</span>
                    <span className="ml-2 text-muted-foreground">
                      {format(new Date(r.generatedAt), "PPP")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${scoreColor(r.overallScore)}`}>
                      {r.overallScore}/100
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => loadPastReport(r.id)}>
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Helper subcomponents ──────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={onToggle}
      >
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

function ClipboardListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}
