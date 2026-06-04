"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PlatformValidationResult = {
  platform: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

type ContentRulesResult = {
  violations: Array<{ type: string; severity: string; message: string }>;
  errors: number;
  warnings: number;
  compliant: boolean;
};

type BrandResult = {
  violations: Array<{ type: string; message: string }>;
  compliant: boolean;
  score: number;
} | null;

type PostValidationResult = {
  postId: string;
  content: string;
  status: string;
  platformResults: PlatformValidationResult[];
  contentRulesResult: ContentRulesResult;
  brandResult: BrandResult;
  overallValid: boolean;
  errorCount: number;
  warningCount: number;
};

type BulkValidateResponse = {
  results: PostValidationResult[];
  totalPosts: number;
  passingPosts: number;
  failingPosts: number;
};

interface BulkValidationDialogProps {
  selectedIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function PostResultRow({ result }: { result: PostValidationResult }) {
  const [expanded, setExpanded] = useState(false);

  const hasPlatformIssues = result.platformResults.some(
    (pr) => pr.errors.length > 0 || pr.warnings.length > 0
  );
  const hasRuleIssues = result.contentRulesResult.violations.length > 0;
  const hasBrandIssues = result.brandResult !== null && !result.brandResult.compliant;

  const hasDetails = hasPlatformIssues || hasRuleIssues || hasBrandIssues;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {result.overallValid ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {result.content.slice(0, 80)}{result.content.length >= 80 ? "…" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.status.toLowerCase()}
              {result.errorCount > 0 && (
                <span className="ml-2 text-red-600">
                  {result.errorCount} error{result.errorCount !== 1 ? "s" : ""}
                </span>
              )}
              {result.warningCount > 0 && (
                <span className="ml-2 text-yellow-600">
                  {result.warningCount} warning{result.warningCount !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="mt-3 space-y-2 border-t pt-2">
          {/* Platform validation issues */}
          {result.platformResults.map((pr) => {
            if (pr.errors.length === 0 && pr.warnings.length === 0) return null;
            return (
              <div key={pr.platform}>
                <p className="text-xs font-semibold text-muted-foreground">{pr.platform}</p>
                {pr.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-red-600">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{e}</span>
                  </div>
                ))}
                {pr.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-yellow-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Content rules violations */}
          {hasRuleIssues && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Content Rules</p>
              {result.contentRulesResult.violations.map((v, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-1 text-xs ${
                    v.severity === "ERROR" ? "text-red-600" : "text-yellow-600"
                  }`}
                >
                  {v.severity === "ERROR" ? (
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  )}
                  <span>{v.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Brand compliance violations */}
          {hasBrandIssues && result.brandResult && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                Brand Compliance (score: {result.brandResult.score})
              </p>
              {result.brandResult.violations.map((v, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-red-600">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{v.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BulkValidationDialog({
  selectedIds,
  open,
  onOpenChange,
  onDone,
}: BulkValidationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BulkValidateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runValidation() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/posts/bulk-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: selectedIds }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Validation failed");
      }
      const json = (await res.json()) as BulkValidateResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run validation when dialog opens
  useEffect(() => {
    if (open && selectedIds.length > 0) {
      void runValidation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(val: boolean) {
    if (!val) {
      setData(null);
      setError(null);
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Pre-flight Check — {selectedIds.length} Post{selectedIds.length !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-3 text-sm text-muted-foreground">Validating…</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-4 rounded-md bg-muted/50 p-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{data.passingPosts} passing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">{data.failingPosts} failing</span>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {data.totalPosts} checked
              </div>
            </div>

            {/* Per-post results */}
            <div className="space-y-2">
              {data.results.map((result) => (
                <PostResultRow key={result.postId} result={result} />
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          {(data ?? error) && !loading && (
            <Button variant="outline" size="sm" onClick={runValidation}>
              Re-check
            </Button>
          )}
          <div className="ml-auto">
            <Button
              onClick={() => {
                handleOpenChange(false);
                onDone();
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
