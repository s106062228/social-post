"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Copy, ExternalLink, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CalendarShare {
  id: string;
  token: string;
  title: string;
  platforms: string[];
  startDate: string | null;
  endDate: string | null;
  showContent: boolean;
  expiresAt: string | null;
  views: number;
  createdAt: string;
}

export default function CalendarSharesPage() {
  const [shares, setShares] = useState<CalendarShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [showContent, setShowContent] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar-shares");
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/calendar-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          showContent,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create share");
        return;
      }
      const data = await res.json();
      setShares((prev) => [data.share, ...prev]);
      setTitle("");
      setShowContent(true);
      setStartDate("");
      setEndDate("");
      setOpen(false);
      toast.success("Calendar share created");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Revoke this calendar share?")) return;
    const res = await fetch(`/api/calendar-shares/${id}`, { method: "DELETE" });
    if (res.ok) {
      setShares((prev) => prev.filter((s) => s.id !== id));
      toast.success("Calendar share revoked");
    } else {
      toast.error("Failed to revoke share");
    }
  };

  const getShareUrl = (token: string) =>
    `${window.location.origin}/cal/${token}`;

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(getShareUrl(token));
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar Shares</h1>
          <p className="text-muted-foreground">
            Share read-only calendar views with clients or collaborators.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Share
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Calendar Share</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="share-title">Title</Label>
                <Input
                  id="share-title"
                  placeholder="Client calendar"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start date (optional)</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End date (optional)</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="show-content"
                  type="checkbox"
                  checked={showContent}
                  onChange={(e) => setShowContent(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="show-content">Show post content</Label>
              </div>
              <Button onClick={handleCreate} disabled={creating || !title.trim()}>
                {creating ? "Creating…" : "Create Share"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : shares.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No calendar shares yet. Create one to share your content calendar with clients.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {shares.map((share) => (
            <Card key={share.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{share.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Created {formatDistanceToNow(new Date(share.createdAt))} ago
                      {share.expiresAt &&
                        ` · Expires ${formatDistanceToNow(new Date(share.expiresAt))}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground mr-2">
                      <Eye className="h-3.5 w-3.5" />
                      {share.views}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyUrl(share.token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/cal/${share.token}`} target="_blank">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(share.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {share.startDate && <span>From {share.startDate}</span>}
                  {share.endDate && <span>To {share.endDate}</span>}
                  {!share.startDate && !share.endDate && <span>All dates</span>}
                  <span>·</span>
                  <span>{share.showContent ? "Content visible" : "Content hidden"}</span>
                </div>
                <div className="mt-2 font-mono text-xs text-muted-foreground truncate">
                  {typeof window !== "undefined" ? getShareUrl(share.token) : `/cal/${share.token}`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
