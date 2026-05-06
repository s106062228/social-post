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

export default function TelegramConnectPage() {
  const router = useRouter();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken, chatId }),
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
        <h1 className="text-3xl font-bold tracking-tight">Connect Telegram</h1>
        <p className="text-muted-foreground">
          Use a Telegram Bot token to publish posts to a channel or group.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Telegram Bot Setup</CardTitle>
          <CardDescription>
            Create a bot via{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              @BotFather
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            on Telegram, then add the bot as an administrator to your channel or
            group.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="botToken">Bot Token</Label>
              <Input
                id="botToken"
                type="password"
                placeholder="123456789:ABCdefGHI..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                required
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                The HTTP API token provided by @BotFather when you created your
                bot.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chatId">Chat / Channel ID</Label>
              <Input
                id="chatId"
                type="text"
                placeholder="-1001234567890 or @mychannel"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                The numeric ID of your channel/group (e.g.{" "}
                <code>-1001234567890</code>) or its public username prefixed
                with <code>@</code> (e.g. <code>@mychannel</code>). Make sure
                the bot is an admin of that chat.
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
                {loading ? "Connecting…" : "Connect Bot"}
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
