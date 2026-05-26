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

export default function PixelfedConnectPage() {
  const router = useRouter();
  const [instanceUrl, setInstanceUrl] = useState("https://pixelfed.social");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/pixelfed/connect", {
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Pixelfed</h1>
        <p className="text-muted-foreground">
          Use a Pixelfed access token to connect your account securely.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pixelfed Access Token</CardTitle>
          <CardDescription>
            Generate an access token in your Pixelfed instance under{" "}
            <a
              href="#"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                const cleanUrl = instanceUrl.replace(/\/$/, "");
                window.open(`${cleanUrl}/settings/applications`, "_blank");
              }}
              className="underline inline-flex items-center gap-1"
            >
              Settings &rarr; Developer Applications
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
                placeholder="https://pixelfed.social"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                required
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                The base URL of your Pixelfed instance (e.g.
                https://pixelfed.social, https://pixelfed.de).
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accessToken">Access Token</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="Your Pixelfed access token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Create an application in your Pixelfed settings and copy its
                access token here. Grant at least <code>read</code> and{" "}
                <code>write</code> scopes.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to get your access token</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Log in to your Pixelfed instance</li>
            <li>
              Go to <strong>Settings &rarr; Developer Applications</strong>
            </li>
            <li>Click <strong>Create Application</strong></li>
            <li>
              Set the redirect URI to{" "}
              <code>urn:ietf:wg:oauth:2.0:oob</code> and enable{" "}
              <strong>read</strong> and <strong>write</strong> scopes
            </li>
            <li>
              After saving, click your app name and copy the{" "}
              <strong>Access Token</strong>
            </li>
            <li>Paste the token above and click Connect</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
