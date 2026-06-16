"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  Leaf,
  RefreshCw,
  Star,
  ThumbsUp,
  MessageSquare,
  Share2,
} from "lucide-react";
import type {
  EvergreenCandidatesResponse,
  EvergreenCandidate,
} from "@/app/api/analytics/evergreen-candidates/route";

function ScoreBadge({ label }: { label: EvergreenCandidate["label"] }) {
  const colors: Record<EvergreenCandidate["label"], string> = {
    Excellent: "bg-green-500 text-white",
    Good: "bg-blue-500 text-white",
    Fair: "bg-yellow-500 text-white",
    Poor: "bg-gray-400 text-white",
  };
  return <Badge className={colors[label]}>{label}</Badge>;
}

function MetricChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      <span>{value.toLocaleString()}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface EvergreenDiscoveryCardProps {
  onMarkEvergreen?: (postId: string) => Promise<void>;
  onRecycle?: (postId: string) => Promise<void>;
}

export function EvergreenDiscoveryCard({
  onMarkEvergreen,
  onRecycle,
}: EvergreenDiscoveryCardProps) {
  const [minScore, setMinScore] = useState(40);
  const [data, setData] = useState<EvergreenCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchData = useCallback(async (score: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/evergreen-candidates?minScore=${score}&limit=20`
      );
      if (!res.ok) throw new Error("Failed to load candidates");
      const json: EvergreenCandidatesResponse = await res.json();
      setData(json);
    } catch {
      setError("Could not load evergreen candidates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(minScore);
  }, [fetchData, minScore]);

  const handleMarkEvergreen = async (postId: string) => {
    setActioningId(postId);
    try {
      if (onMarkEvergreen) {
        await onMarkEvergreen(postId);
      } else {
        await fetch(`/api/posts/${postId}/evergreen`, { method: "PATCH" });
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.filter((c) => c.postId !== postId),
            }
          : prev
      );
    } finally {
      setActioningId(null);
    }
  };

  const handleRecycle = async (postId: string) => {
    setActioningId(postId);
    try {
      if (onRecycle) {
        await onRecycle(postId);
      } else {
        await fetch(`/api/posts/${postId}/recycle`, { method: "POST" });
      }
    } finally {
      setActioningId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-500" />
            <CardTitle className="text-base">Evergreen Candidates</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchData(minScore)}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Published posts best suited for recycling based on engagement,
          age, and timelessness.
        </CardDescription>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.totalAnalyzed} posts analysed · avg score {data.avgScore}
          </p>
        )}
      </CardHeader>

      {/* Min score filter */}
      <div className="px-6 pb-2 flex gap-1">
        {[30, 40, 50, 60].map((s) => (
          <button
            key={s}
            onClick={() => setMinScore(s)}
            className={`rounded px-2 py-0.5 text-xs border transition-colors ${
              minScore === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            ≥{s}
          </button>
        ))}
      </div>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 text-destructive text-sm py-4">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && data?.candidates.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No candidates found with score ≥{minScore}. Try lowering the
            threshold or sync your post insights first.
          </p>
        )}

        {!loading && !error && data && data.candidates.length > 0 && (
          <ul className="space-y-3">
            {data.candidates.map((c) => (
              <li
                key={c.postId}
                className="rounded-lg border p-3 space-y-2 bg-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm line-clamp-2 flex-1">{c.content}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-semibold">{c.score}</span>
                    <ScoreBadge label={c.label} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <MetricChip
                    icon={<ThumbsUp className="h-3 w-3" />}
                    value={c.likes}
                    label="likes"
                  />
                  <MetricChip
                    icon={<MessageSquare className="h-3 w-3" />}
                    value={c.comments}
                    label="comments"
                  />
                  <MetricChip
                    icon={<Share2 className="h-3 w-3" />}
                    value={c.shares}
                    label="shares"
                  />
                  <span className="text-xs text-muted-foreground">
                    {c.ageInDays}d old
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={actioningId === c.postId}
                    onClick={() => handleMarkEvergreen(c.postId)}
                  >
                    {actioningId === c.postId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Star className="h-3 w-3" />
                    )}
                    Mark Evergreen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={actioningId === c.postId}
                    onClick={() => handleRecycle(c.postId)}
                  >
                    {actioningId === c.postId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Recycle Now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
