"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Link2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LinkHealthCheck {
  id: string;
  url: string;
  statusCode: number | null;
  isHealthy: boolean;
  errorMessage: string | null;
  checkedAt: string;
}

interface LinkHealthResponse {
  checks: LinkHealthCheck[];
  total: number;
  healthy: number;
  broken: number;
  lastCheckedAt: string | null;
}

interface LinkHealthCardProps {
  postId: string;
}

export function LinkHealthCard({ postId }: LinkHealthCardProps) {
  const [data, setData] = useState<LinkHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/link-health`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load link health");
      }
      const body = (await res.json()) as LinkHealthResponse;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/check-links`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to check links");
      }
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setChecking(false);
    }
  }, [postId, fetchHealth]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Link Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Link Health
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Check Links"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-muted-foreground">{error}</p>}

        {!error && (!data || data.total === 0) && (
          <p className="text-sm text-muted-foreground">
            No links found in this post. Add a URL to the content and run a check.
          </p>
        )}

        {!error && data && data.total > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              {data.broken === 0
                ? `All ${data.total} link${data.total === 1 ? "" : "s"} are healthy.`
                : `${data.broken} of ${data.total} link${data.total === 1 ? "" : "s"} ${
                    data.broken === 1 ? "is" : "are"
                  } broken.`}
              {data.lastCheckedAt && (
                <> Last checked {new Date(data.lastCheckedAt).toLocaleString()}.</>
              )}
            </p>
            <ul className="space-y-2">
              {data.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2 text-xs">
                  {check.isHealthy ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                  )}
                  <div className="min-w-0">
                    <a
                      href={check.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground font-medium break-all hover:underline"
                    >
                      {check.url}
                    </a>
                    <p className="text-muted-foreground mt-0.5">
                      {check.isHealthy
                        ? `OK${check.statusCode ? ` · HTTP ${check.statusCode}` : ""}`
                        : (check.errorMessage ??
                          (check.statusCode ? `HTTP ${check.statusCode}` : "Unreachable"))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
