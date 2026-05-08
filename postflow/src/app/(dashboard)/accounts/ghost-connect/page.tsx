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

export default function GhostConnectPage() {
  const router = useRouter();
  const [instanceUrl, setInstanceUrl] = useState("https://your-ghost-site.com");
  const [adminApiKey, setAdminApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/ghost/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, adminApiKey }),
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Ghost CMS</h1>
        <p className="text-muted-foreground">
          Use a Ghost Admin API key to connect your site and publish posts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ghost Admin API Key</CardTitle>
          <CardDescription>
            Generate an Admin API key in your Ghost Admin panel under{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const cleanUrl = instanceUrl.replace(/\/$/, "");
                window.open(`${cleanUrl}/ghost/#/settings/integrations`, "_blank");
              }}
              className="underline inline-flex items-center gap-1"
            >
              Settings → Integrations → Add custom integration
              <ExternalLink className="h-3 w-3" />
            </a>
            . Copy the Admin API Key in the format <code>id:secret</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instanceUrl">Ghost Site URL</Label>
              <Input
                id="instanceUrl"
                type="url"
                placeholder="https://your-ghost-site.com"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                required
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                The base URL of your Ghost site (e.g. https://myblog.ghost.io
                or https://ghost.myblog.com). Works with Ghost(Pro) and
                self-hosted installations.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminApiKey">Admin API Key</Label>
              <Input
                id="adminApiKey"
                type="password"
                placeholder="1234567890abcdef:abcdef1234567890abcdef1234..."
                value={adminApiKey}
                onChange={(e) => setAdminApiKey(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                The Admin API Key from Ghost Admin → Settings → Integrations.
                Format: <code>id:secret</code> (both are hex strings).
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
                {loading ? "Connecting…" : "Connect Ghost Site"}
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
          <CardTitle className="text-base">How to get your Admin API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Go to your Ghost Admin panel</li>
            <li>Navigate to <strong>Settings → Integrations</strong></li>
            <li>Click <strong>Add custom integration</strong> and give it a name (e.g. "PostFlow")</li>
            <li>Copy the <strong>Admin API Key</strong> shown on the integration page</li>
            <li>Paste it above along with your Ghost site URL</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
