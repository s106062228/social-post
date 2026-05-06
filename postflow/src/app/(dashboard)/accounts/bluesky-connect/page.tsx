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

export default function BlueskyConnectPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/bluesky/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, appPassword }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Authentication failed. Please check your credentials.");
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Bluesky</h1>
        <p className="text-muted-foreground">
          Use a Bluesky app password to connect your account securely.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bluesky App Password</CardTitle>
          <CardDescription>
            Create an app password in your Bluesky settings under{" "}
            <a
              href="https://bsky.app/settings/app-passwords"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Settings → App Passwords
              <ExternalLink className="h-3 w-3" />
            </a>
            . Do not use your main account password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">Handle or DID</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="user.bsky.social"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
              />
              <p className="text-xs text-muted-foreground">
                Your Bluesky handle (e.g. alice.bsky.social) or DID.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="appPassword">App Password</Label>
              <Input
                id="appPassword"
                type="password"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Generate an app password in Bluesky settings. It will not be
                stored — only the session token is saved.
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
