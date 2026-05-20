"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { CompareResponse, ComparisonPost } from "@/app/api/analytics/compare/route";

interface PostComparisonDialogProps {
  postIds: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function MetricRow({
  label,
  values,
  winnerId,
  posts,
}: {
  label: string;
  values: (post: ComparisonPost) => number;
  winnerId: string | null;
  posts: ComparisonPost[];
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 text-sm font-medium text-muted-foreground">{label}</td>
      {posts.map((post) => (
        <td
          key={post.id}
          className={`py-2 px-3 text-center text-sm ${
            post.id === winnerId ? "font-semibold text-amber-600" : ""
          }`}
        >
          {values(post).toLocaleString()}
        </td>
      ))}
    </tr>
  );
}

export function PostComparisonDialog({
  postIds,
  open,
  onOpenChange,
}: PostComparisonDialogProps) {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || postIds.length < 2) return;

    setLoading(true);
    setError(null);
    setData(null);

    const params = postIds.map((id) => `postId[]=${encodeURIComponent(id)}`).join("&");

    fetch(`/api/analytics/compare?${params}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to load comparison data");
        }
        return res.json() as Promise<CompareResponse>;
      })
      .then((json) => {
        setData(json);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unexpected error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, postIds]);

  const hasAnyInsights =
    data !== null &&
    data.posts.some(
      (p) =>
        p.totalImpressions > 0 ||
        p.totalReach > 0 ||
        p.totalLikes > 0 ||
        p.totalComments > 0 ||
        p.totalShares > 0
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-x-auto">
        <DialogHeader>
          <DialogTitle>Post Comparison</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {!hasAnyInsights && (
              <p className="text-sm text-muted-foreground">
                No insights data available for the selected posts.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-max table-auto border-collapse text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4 text-sm font-semibold">Metric</th>
                    {data.posts.map((post) => (
                      <th
                        key={post.id}
                        className="px-3 py-2 text-center text-sm font-semibold"
                      >
                        {post.id === data.winnerId && (
                          <span className="mb-1 block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            Winner 🏆
                          </span>
                        )}
                        <span className="block max-w-[160px] truncate text-left text-xs text-muted-foreground">
                          {truncate(post.content, 80)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <MetricRow
                    label="Total Score"
                    values={(p) => Math.round(p.totalScore)}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                  <MetricRow
                    label="Impressions"
                    values={(p) => p.totalImpressions}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                  <MetricRow
                    label="Reach"
                    values={(p) => p.totalReach}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                  <MetricRow
                    label="Likes"
                    values={(p) => p.totalLikes}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                  <MetricRow
                    label="Comments"
                    values={(p) => p.totalComments}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                  <MetricRow
                    label="Shares"
                    values={(p) => p.totalShares}
                    winnerId={data.winnerId}
                    posts={data.posts}
                  />
                </tbody>
              </table>
            </div>

            {/* Per-platform breakdown */}
            {data.posts.some((p) => p.platforms.length > 0) && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold">Per-platform breakdown</p>
                {data.posts.map((post) =>
                  post.platforms.length > 0 ? (
                    <div key={post.id} className="rounded-md border p-3">
                      <p className="mb-2 truncate text-xs font-medium text-muted-foreground">
                        {truncate(post.content, 60)}
                      </p>
                      <div className="space-y-1">
                        {post.platforms.map((plat) => (
                          <div
                            key={plat.platform}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                          >
                            <span className="w-24 font-medium">{plat.platform}</span>
                            <span className="text-muted-foreground">
                              Score: <strong>{Math.round(plat.score)}</strong>
                            </span>
                            <span className="text-muted-foreground">
                              Imp: {plat.impressions.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                              Reach: {plat.reach.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                              Likes: {plat.likes.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                              Cmts: {plat.comments.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                              Shares: {plat.shares.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
