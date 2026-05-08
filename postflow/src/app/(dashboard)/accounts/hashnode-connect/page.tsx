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

export default function HashnodeConnectPage() {
  const router = useRouter();
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/hashnode/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(
          data.error ?? "Authentication failed. Please check your access token."
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Hashnode</h1>
        <p className="text-muted-foreground">
          Use a personal access token to connect your Hashnode account and
          publish articles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hashnode Personal Access Token</CardTitle>
          <CardDescription>
            Generate a personal access token in your Hashnode account settings
            under{" "}
            <a
              href="https://hashnode.com/settings/developer"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Settings → Developer
              <ExternalLink className="h-3 w-3" />
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiToken">Personal Access Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Enter your Hashnode personal access token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Your token is stored encrypted and never exposed to the browser
                after connection. A Hashnode publication is required — the
                adapter uses your first publication.
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
                {loading ? "Connecting…" : "Connect Hashnode"}
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
          <CardTitle className="text-base">
            How to get your Access Token
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Go to your Hashnode profile</li>
            <li>
              Navigate to{" "}
              <strong>Account Settings → Developer</strong>
            </li>
            <li>
              Click <strong>Generate New Token</strong>
            </li>
            <li>Give it a name (e.g. &quot;PostFlow&quot;) and click Create</li>
            <li>Copy the generated token and paste it above</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Note: You must have at least one Hashnode publication to publish
            articles. The first publication on your account will be used.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
