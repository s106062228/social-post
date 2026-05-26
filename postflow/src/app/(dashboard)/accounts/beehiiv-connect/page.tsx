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

export default function BeehiivConnectPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/beehiiv/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, publicationId }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        publicationName?: string;
      };

      if (!res.ok || !data.success) {
        setError(
          data.error ??
            "Authentication failed. Please check your API key and publication ID."
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Beehiiv</h1>
        <p className="text-muted-foreground">
          Use a personal API key to connect your Beehiiv newsletter and publish
          drafts directly from PostFlow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Beehiiv API Credentials</CardTitle>
          <CardDescription>
            Generate an API key in your Beehiiv{" "}
            <a
              href="https://app.beehiiv.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Settings → API
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and find your Publication ID in{" "}
            <a
              href="https://app.beehiiv.com/settings/publication"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Settings → Publication
              <ExternalLink className="h-3 w-3" />
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your Beehiiv API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publicationId">Publication ID</Label>
              <Input
                id="publicationId"
                type="text"
                placeholder="pub_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={publicationId}
                onChange={(e) => setPublicationId(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Found in your Beehiiv publication settings. Starts with{" "}
                <code className="font-mono">pub_</code>.
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
                {loading ? "Connecting…" : "Connect Beehiiv"}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to get your credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Log in to your Beehiiv account</li>
            <li>
              Go to <strong>Settings → API</strong> and click{" "}
              <strong>Generate new API key</strong>
            </li>
            <li>Copy the API key and paste it above</li>
            <li>
              Go to <strong>Settings → Publication</strong> to find your
              Publication ID (starts with <code>pub_</code>)
            </li>
            <li>Paste the Publication ID above and click Connect</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
