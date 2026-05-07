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
import { AlertCircle } from "lucide-react";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
].join("\n");

export default function NostrConnectPage() {
  const router = useRouter();
  const [privateKey, setPrivateKey] = useState("");
  const [relayUrlsText, setRelayUrlsText] = useState(DEFAULT_RELAYS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const relayUrls = relayUrlsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (relayUrls.length === 0) {
      setError("Please enter at least one relay URL.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/oauth/nostr/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: privateKey.trim(), relayUrls }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(
          data.error ?? "Authentication failed. Please check your private key."
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Nostr</h1>
        <p className="text-muted-foreground">
          Use your Nostr private key to publish notes to the decentralized Nostr
          network.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Private Key & Relays</CardTitle>
          <CardDescription>
            Enter your Nostr private key in{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">nsec…</code>{" "}
            or 64-character hex format, and the relay URLs you want to publish
            to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="privateKey">Private Key</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="nsec1… or 64-character hex"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Your Nostr private key (nsec) or raw 64-character hex. This is
                stored encrypted and never leaves the server in plaintext.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="relayUrls">Relay URLs (one per line)</Label>
              <textarea
                id="relayUrls"
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none"
                placeholder="wss://relay.damus.io"
                value={relayUrlsText}
                onChange={(e) => setRelayUrlsText(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Each line must start with{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">wss://</code>{" "}
                or{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">ws://</code>.
                Up to 10 relays.
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

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
        <CardContent className="pt-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Security note:</strong> Your private key controls your
            Nostr identity. Only connect from a trusted device. PostFlow stores
            it AES-256-GCM encrypted in the database and never exposes it to
            the browser.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
