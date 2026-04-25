"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Clock, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PostComments } from "@/components/post-comments";
import { PostInsightsPanel } from "@/components/post-insights-panel";

interface PostVersion {
  id: string;
  content: string;
  mediaType: string;
  mediaUrls: string[];
  createdAt: string;
}

export default function PostVersionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = params.id;

  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/versions`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load versions");
      }
      const data = (await res.json()) as { versions: PostVersion[] };
      setVersions(data.versions);
    } catch (err) {
      toast({
        title: "Failed to load version history",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  async function restoreVersion(versionId: string) {
    setRestoringId(versionId);
    try {
      const res = await fetch(
        `/api/posts/${postId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to restore version");
      }
      toast({ title: "Version restored", variant: "success" });
      void fetchVersions();
    } catch (err) {
      toast({
        title: "Restore failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Version History</h1>
          <p className="text-sm text-muted-foreground">
            View and restore previous versions of this post.
          </p>
        </div>
      </div>

      <PostInsightsPanel postId={postId} />

      <PostComments postId={postId} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <p className="font-medium">No version history yet</p>
            <p className="text-sm mt-1">
              Versions are saved automatically each time you edit the post content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {versions.map((version, index) => {
            const isExpanded = expandedId === version.id;
            const isRestoring = restoringId === version.id;
            const date = new Date(version.createdAt);
            return (
              <Card key={version.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {date.toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        at{" "}
                        {date.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </CardTitle>
                      {index === 0 && (
                        <CardDescription className="text-xs mt-0.5">Most recent</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : version.id)}
                        className="h-7 text-xs"
                      >
                        {isExpanded ? "Hide" : "Preview"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void restoreVersion(version.id)}
                        disabled={isRestoring}
                        className="h-7 text-xs"
                      >
                        {isRestoring ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Restore
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="rounded-md bg-muted/50 border p-3 text-sm whitespace-pre-wrap font-mono text-foreground/80 max-h-48 overflow-y-auto">
                      {version.content}
                    </div>
                    {version.mediaUrls.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {version.mediaUrls.length} media file
                        {version.mediaUrls.length !== 1 ? "s" : ""} attached
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
