"use client";

import { useState } from "react";
import {
  Loader2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { LegalComplianceResult, LegalIssue, LegalIssueSeverity } from "@/lib/ai";

type Industry =
  | "general"
  | "healthcare"
  | "finance"
  | "food_beverage"
  | "beauty_cosmetics"
  | "fitness_wellness"
  | "legal_services"
  | "real_estate"
  | "education"
  | "retail_ecommerce"
  | "travel_hospitality"
  | "technology"
  | "entertainment"
  | "non_profit";

const INDUSTRY_LABELS: Record<Industry, string> = {
  general: "General",
  healthcare: "Healthcare",
  finance: "Finance",
  food_beverage: "Food & Beverage",
  beauty_cosmetics: "Beauty & Cosmetics",
  fitness_wellness: "Fitness & Wellness",
  legal_services: "Legal Services",
  real_estate: "Real Estate",
  education: "Education",
  retail_ecommerce: "Retail / E-commerce",
  travel_hospitality: "Travel & Hospitality",
  technology: "Technology",
  entertainment: "Entertainment",
  non_profit: "Non-Profit",
};

const COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "EU", label: "European Union" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "UAE" },
];

function severityColor(severity: LegalIssueSeverity): string {
  switch (severity) {
    case "high":
      return "text-red-600 bg-red-50 border-red-200";
    case "medium":
      return "text-amber-600 bg-amber-50 border-amber-200";
    case "low":
      return "text-blue-600 bg-blue-50 border-blue-200";
  }
}

function severityIcon(severity: LegalIssueSeverity) {
  switch (severity) {
    case "high":
      return <ShieldX className="h-4 w-4 text-red-500" />;
    case "medium":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "low":
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function riskBadge(risk: "low" | "medium" | "high") {
  switch (risk) {
    case "high":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
          <ShieldX className="h-3 w-3" /> High Risk
        </span>
      );
    case "medium":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <ShieldAlert className="h-3 w-3" /> Medium Risk
        </span>
      );
    case "low":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
          <ShieldCheck className="h-3 w-3" /> Low Risk
        </span>
      );
  }
}

function IssueCard({ issue }: { issue: LegalIssue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-3 ${severityColor(issue.severity)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {severityIcon(issue.severity)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium capitalize">
                {issue.type.replace(/_/g, " ")}
              </span>
              <span className="text-xs opacity-70">{issue.regulation}</span>
            </div>
            <p className="text-xs mt-0.5 leading-relaxed">{issue.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 p-0.5 hover:opacity-70 transition-opacity"
          aria-label={expanded ? "Hide suggestion" : "Show suggestion"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pl-6 border-t border-current border-opacity-20 pt-2">
          <p className="text-xs font-medium mb-0.5">Suggestion:</p>
          <p className="text-xs leading-relaxed">{issue.suggestion}</p>
        </div>
      )}
    </div>
  );
}

interface LegalComplianceDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: string[];
}

export function LegalComplianceDialog({
  open,
  onClose,
  content,
  platforms,
}: LegalComplianceDialogProps) {
  const [industry, setIndustry] = useState<Industry>("general");
  const [country, setCountry] = useState("US");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegalComplianceResult | null>(null);

  async function runCheck() {
    if (!content.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/ai/legal-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, platforms, industry, country }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Check failed");
      }

      const data = await res.json() as LegalComplianceResult;
      setResult(data);
    } catch (err) {
      toast({
        title: "Compliance check failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const highCount = result?.issues.filter((i) => i.severity === "high").length ?? 0;
  const medCount = result?.issues.filter((i) => i.severity === "medium").length ?? 0;
  const lowCount = result?.issues.filter((i) => i.severity === "low").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Legal &amp; Regulatory Compliance Check
          </DialogTitle>
          <DialogDescription>
            AI-powered analysis for FTC disclosures, health claims, financial advice, privacy issues, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.keys(INDUSTRY_LABELS) as Industry[]).map((k) => (
                  <option key={k} value={k}>
                    {INDUSTRY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Country / Region</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content preview */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Post content ({content.length} chars)</p>
            <p className="text-sm leading-relaxed line-clamp-3">{content}</p>
          </div>

          {/* Run button */}
          <Button
            onClick={() => void runCheck()}
            disabled={loading || !content.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking compliance…
              </>
            ) : result ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-check
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Check Compliance
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Summary header */}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-card">
                <div>
                  <div className="flex items-center gap-2">
                    {result.compliant ? (
                      <ShieldCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <ShieldAlert className="h-5 w-5 text-amber-500" />
                    )}
                    <span className="font-medium text-sm">
                      {result.compliant ? "No issues found" : `${result.issues.length} issue${result.issues.length !== 1 ? "s" : ""} found`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{result.summary}</p>
                </div>
                <div className="flex-shrink-0">
                  {riskBadge(result.overallRisk)}
                </div>
              </div>

              {/* Issue count breakdown */}
              {result.issues.length > 0 && (
                <div className="flex items-center gap-3 text-xs">
                  {highCount > 0 && (
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <ShieldX className="h-3.5 w-3.5" />
                      {highCount} high
                    </span>
                  )}
                  {medCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {medCount} medium
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                      <Info className="h-3.5 w-3.5" />
                      {lowCount} low
                    </span>
                  )}
                </div>
              )}

              {/* Issue list */}
              {result.issues.length > 0 ? (
                <div className="space-y-2">
                  {/* High severity first */}
                  {[...result.issues]
                    .sort((a, b) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return order[a.severity] - order[b.severity];
                    })
                    .map((issue, idx) => (
                      <IssueCard key={idx} issue={issue} />
                    ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                  <span>This post appears to be compliant with applicable regulations.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
