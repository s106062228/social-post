"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ExternalLink } from "lucide-react";

export default function MastodonConnectPage() {
  const router = useRouter();
  const [instanceUrl, setInstanceUrl] = useState("https://mastodon.social");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/mastodon/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, accessToken }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(
          data.error ?? "Authentication failed. Please check your credentials."
        );
        return;
      }

      router.push("/accounts?success=1");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-8 max-w-lg mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Mastodon</h1>
        <p className="text-muted-foreground">
          Use a Mastodon access token to connect your account securely.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mastodon Access Token</CardTitle>
          <CardDescription>
            Generate an access token in your Mastodon instance under{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const cleanUrl = instanceUrl.replace(/\/$/, "");
                window.open(`${cleanUrl}/settings/applications`, "_blank");
              }}
              className="underline inline-flex items-center gap-1"
            >
              Settings → Development → New Application
              <ExternalLink className="h-3 w-3" />
            </a>
            . Grant <code>read</code> and <code>write</code> scopes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instanceUrl">Instance URL</Label>
              <Input
                id="instanceUrl"
                type="url"
                placeholder="https://mastodon.social"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                required
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                The base URL of your Mastodon instance (e.g.
                https://mastodon.social, https://fosstodon.org).
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accessToken">Access Token</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="Your Mastodon access token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Create an application in your Mastodon settings and copy its
                access token here. Grant at least <code>read</code> and{" "}
                <code>write:statuses</code> scopes.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Connecting…" : "Connect Account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/accounts")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
