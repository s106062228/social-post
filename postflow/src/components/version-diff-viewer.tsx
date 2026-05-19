"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, GitCompare, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffChunk {
  type: "added" | "removed" | "unchanged";
  text: string;
}

interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

interface VersionMeta {
  id: string;
  createdAt: string;
}

interface VersionDiffViewerProps {
  postId: string;
  fromVersionId: string;
  toVersionId: string | "current";
  fromLabel: string;
  toLabel: string;
  onClose: () => void;
}

export function VersionDiffViewer({
  postId,
  fromVersionId,
  toVersionId,
  fromLabel,
  toLabel,
  onClose,
}: VersionDiffViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffChunk[] | null>(null);
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [fromVersion, setFromVersion] = useState<VersionMeta | null>(null);
  const [toVersion, setToVersion] = useState<VersionMeta | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const url = `/api/posts/${postId}/versions/diff?from=${fromVersionId}&to=${toVersionId}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to load diff");
        }
        return res.json() as Promise<{
          diff: DiffChunk[];
          stats: DiffStats;
          fromVersion: VersionMeta;
          toVersion: VersionMeta;
        }>;
      })
      .then((data) => {
        setDiff(data.diff);
        setStats(data.stats);
        setFromVersion(data.fromVersion);
        setToVersion(data.toVersion);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "An error occurred");
      })
      .finally(() => setLoading(false));
  }, [postId, fromVersionId, toVersionId]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{fromLabel}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-foreground">{toLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              {stats.added > 0 && (
                <span className="text-green-600 dark:text-green-400 font-mono">
                  +{stats.added}
                </span>
              )}
              {stats.removed > 0 && (
                <span className="text-red-600 dark:text-red-400 font-mono">
                  -{stats.removed}
                </span>
              )}
              {stats.added === 0 && stats.removed === 0 && (
                <span className="text-muted-foreground">No changes</span>
              )}
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-destructive text-center py-4">{error}</p>
        )}

        {diff && !loading && (
          <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed rounded-md bg-muted/30 border p-3 max-h-64 overflow-y-auto">
            {diff.length === 0 ? (
              <span className="text-muted-foreground">Empty content</span>
            ) : (
              diff.map((chunk, i) => (
                <span
                  key={i}
                  className={cn({
                    "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200":
                      chunk.type === "added",
                    "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 line-through":
                      chunk.type === "removed",
                    "text-foreground/80": chunk.type === "unchanged",
                  })}
                >
                  {chunk.text}
                </span>
              ))
            )}
          </div>
        )}

        {fromVersion && toVersion && !loading && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              From:{" "}
              {new Date(fromVersion.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>
              To:{" "}
              {toVersion.id === "current"
                ? "Current version"
                : new Date(toVersion.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
