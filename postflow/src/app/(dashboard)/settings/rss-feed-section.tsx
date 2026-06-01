"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rss, Copy, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FeedTokenData {
  token: string;
  createdAt: string;
}

export function RssFeedSection() {
  const [tokenData, setTokenData] = useState<FeedTokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRss, setCopiedRss] = useState(false);
  const [copiedAtom, setCopiedAtom] = useState(false);

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feed/token");
      if (!res.ok) throw new Error("Failed to load feed token");
      const data = (await res.json()) as FeedTokenData;
      setTokenData(data);
    } catch {
      setError("Could not load feed token. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  async function handleRegenerate() {
    if (
      !confirm(
        "Regenerating your feed token will invalidate the old subscription URL. Continue?"
      )
    ) {
      return;
    }

    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/feed/token", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data = (await res.json()) as FeedTokenData;
      setTokenData(data);
      toast({ title: "Feed token regenerated", description: "Your new feed URLs are ready." });
    } catch {
      setError("Could not regenerate feed token. Please try again.");
      toast({ title: "Error", description: "Failed to regenerate feed token.", variant: "destructive" });
    } finally {
      setIsRegenerating(false);
    }
  }

  async function copyToClipboard(text: string, type: "rss" | "atom") {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "rss") {
        setCopiedRss(true);
        setTimeout(() => setCopiedRss(false), 2000);
      } else {
        setCopiedAtom(true);
        setTimeout(() => setCopiedAtom(false), 2000);
      }
      toast({ title: "Copied!", description: `${type.toUpperCase()} feed URL copied to clipboard.` });
    } catch {
      toast({ title: "Copy failed", description: "Please copy the URL manually.", variant: "destructive" });
    }
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const rssUrl = tokenData ? `${baseUrl}/api/feed/rss?token=${tokenData.token}` : "";
  const atomUrl = tokenData ? `${baseUrl}/api/feed/atom?token=${tokenData.token}` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rss className="h-5 w-5" />
          RSS / Atom Feed
        </CardTitle>
        <CardDescription>
          Subscribe to your published posts as an RSS or Atom feed. Share the URL with any feed
          reader. Keep the token private — anyone with the URL can read your published posts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading feed URLs…</div>
        ) : tokenData ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rss-url">RSS 2.0 Feed</Label>
              <div className="flex gap-2">
                <Input
                  id="rss-url"
                  value={rssUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyToClipboard(rssUrl, "rss")}
                  className="shrink-0"
                >
                  {copiedRss ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="ml-1">{copiedRss ? "Copied!" : "Copy"}</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="atom-url">Atom Feed</Label>
              <div className="flex gap-2">
                <Input
                  id="atom-url"
                  value={atomUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyToClipboard(atomUrl, "atom")}
                  className="shrink-0"
                >
                  {copiedAtom ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="ml-1">{copiedAtom ? "Copied!" : "Copy"}</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Token created {new Date(tokenData.createdAt).toLocaleDateString()}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
                {isRegenerating ? "Regenerating…" : "Regenerate Token"}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
