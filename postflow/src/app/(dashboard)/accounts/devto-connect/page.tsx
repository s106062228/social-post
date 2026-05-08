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

export default function DevToConnectPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/devto/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(
          data.error ?? "Authentication failed. Please check your API key."
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Dev.to</h1>
        <p className="text-muted-foreground">
          Use a personal API key to connect your Dev.to account and publish articles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dev.to Personal API Key</CardTitle>
          <CardDescription>
            Generate a personal API key in your Dev.to settings under{" "}
            <a
              href="https://dev.to/settings/extensions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Settings → Extensions → DEV API Keys
              <ExternalLink className="h-3 w-3" />
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiKey">Personal API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your Dev.to personal API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Your API key is stored encrypted and never exposed to the
                browser after connection.
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
                {loading ? "Connecting…" : "Connect Dev.to"}
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
          <CardTitle className="text-base">How to get your API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Go to your Dev.to profile</li>
            <li>Navigate to <strong>Settings → Extensions</strong></li>
            <li>Scroll down to <strong>DEV API Keys</strong></li>
            <li>Enter a description (e.g. "PostFlow") and click <strong>Generate API Key</strong></li>
            <li>Copy the generated key and paste it above</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
