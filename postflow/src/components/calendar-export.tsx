"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CalendarDays, Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function CalendarExport() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  async function fetchToken() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/token");
      if (!res.ok) throw new Error("Failed to fetch token");
      const data = (await res.json()) as { token: string };
      setToken(data.token);
    } catch {
      toast({ title: "Error", description: "Could not load calendar token.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function regenerateToken() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/calendar/token", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      toast({ title: "Token regenerated", description: "Your old subscription URL is now invalid." });
    } catch {
      toast({ title: "Error", description: "Could not regenerate token.", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  }

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && token === null) {
      void fetchToken();
    }
  }

  function copyUrl() {
    if (!token) return;
    const url = `${baseUrl}/api/calendar/export?token=${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Copied!", description: "Subscription URL copied to clipboard." });
    });
  }

  const subscribeUrl = token ? `${baseUrl}/api/calendar/export?token=${token}` : "";
  const downloadUrl = `/api/calendar/export`;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarDays className="mr-2 h-4 w-4" />
          Export / Subscribe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendar Export</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Download section */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Download .ics file</p>
            <p className="text-xs text-muted-foreground">
              One-time download of all scheduled and published posts.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <a href={downloadUrl} download="postflow.ics">
                <Download className="mr-2 h-4 w-4" />
                Download postflow.ics
              </a>
            </Button>
          </div>

          <hr />

          {/* Subscribe section */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Subscribe in your calendar app</p>
            <p className="text-xs text-muted-foreground">
              Add this URL in Google Calendar, Apple Calendar, or Outlook to keep
              your schedule in sync automatically.
            </p>

            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : token ? (
              <>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs break-all">
                  <span className="flex-1 font-mono">{subscribeUrl}</span>
                  <button onClick={copyUrl} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit text-xs text-destructive hover:text-destructive"
                  onClick={() => void regenerateToken()}
                  disabled={regenerating}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {regenerating ? "Regenerating…" : "Regenerate token (invalidates old URL)"}
                </Button>
              </>
            ) : (
              <p className="text-xs text-destructive">Could not load token.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
