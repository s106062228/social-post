"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AtSign,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MentionStatsCard } from "@/components/mention-stats-card";

type MentionSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
type ResponseStatus = "none" | "acknowledged" | "replied" | "ignored";

interface BrandMention {
  id: string;
  mentionUrl: string | null;
  platform: string | null;
  authorName: string | null;
  content: string;
  sentiment: MentionSentiment;
  notes: string | null;
  responseStatus: ResponseStatus;
  relatedPostId: string | null;
  relatedPost: { id: string; content: string; status: string } | null;
  mentionedAt: string;
  createdAt: string;
}

const SENTIMENT_LABELS: Record<MentionSentiment, string> = {
  POSITIVE: "Positive",
  NEUTRAL: "Neutral",
  NEGATIVE: "Negative",
};

const SENTIMENT_COLORS: Record<MentionSentiment, string> = {
  POSITIVE: "bg-green-100 text-green-800",
  NEUTRAL: "bg-gray-100 text-gray-700",
  NEGATIVE: "bg-red-100 text-red-800",
};

const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  none: "No Action",
  acknowledged: "Acknowledged",
  replied: "Replied",
  ignored: "Ignored",
};

const RESPONSE_STATUS_COLORS: Record<ResponseStatus, string> = {
  none: "bg-gray-100 text-gray-600",
  acknowledged: "bg-blue-100 text-blue-700",
  replied: "bg-green-100 text-green-700",
  ignored: "bg-orange-100 text-orange-700",
};

export default function BrandMentionsPage() {
  const [mentions, setMentions] = useState<BrandMention[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [filterSentiment, setFilterSentiment] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Create form
  const [formContent, setFormContent] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formPlatform, setFormPlatform] = useState("");
  const [formAuthorName, setFormAuthorName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSentiment, setFormSentiment] = useState<MentionSentiment>("NEUTRAL");
  const [formResponseStatus, setFormResponseStatus] = useState<ResponseStatus>("none");
  const [formMentionedAt, setFormMentionedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadMentions = useCallback(async (p: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (filterSentiment) params.set("sentiment", filterSentiment);
      if (filterPlatform) params.set("platform", filterPlatform);
      if (filterStatus) params.set("responseStatus", filterStatus);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);

      const res = await fetch(`/api/brand-mentions?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { mentions: BrandMention[]; total: number };
      setMentions(data.mentions);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error("Failed to load mentions");
    } finally {
      setLoading(false);
    }
  }, [page, filterSentiment, filterPlatform, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    loadMentions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSentiment, filterPlatform, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    loadMentions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formContent.trim()) {
      toast.error("Content is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/brand-mentions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: formContent,
          mentionUrl: formUrl || undefined,
          platform: formPlatform || undefined,
          authorName: formAuthorName || undefined,
          notes: formNotes || undefined,
          sentiment: formSentiment,
          responseStatus: formResponseStatus,
          mentionedAt: formMentionedAt ? new Date(formMentionedAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        toast.error(err.error ?? "Failed to create mention");
        return;
      }
      toast.success("Brand mention added");
      setFormContent("");
      setFormUrl("");
      setFormPlatform("");
      setFormAuthorName("");
      setFormNotes("");
      setFormSentiment("NEUTRAL");
      setFormResponseStatus("none");
      setFormMentionedAt("");
      setShowForm(false);
      loadMentions(1);
    } catch {
      toast.error("Failed to create mention");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatus(id: string, responseStatus: ResponseStatus) {
    try {
      const res = await fetch(`/api/brand-mentions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setMentions((prev) =>
        prev.map((m) => (m.id === id ? { ...m, responseStatus } : m))
      );
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/brand-mentions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Mention deleted");
      loadMentions(1);
    } catch {
      toast.error("Failed to delete mention");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AtSign className="h-6 w-6" />
            Brand Mentions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and manage mentions of your brand across the web and social media.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Mention
        </Button>
      </div>

      {/* Stats */}
      <MentionStatsCard />

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Brand Mention</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <Textarea
                placeholder="Mention content *"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={3}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Platform (e.g. Twitter, Reddit)"
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                />
                <Input
                  placeholder="Author name"
                  value={formAuthorName}
                  onChange={(e) => setFormAuthorName(e.target.value)}
                />
              </div>
              <Input
                placeholder="Mention URL (optional)"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                type="url"
              />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sentiment</label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formSentiment}
                    onChange={(e) => setFormSentiment(e.target.value as MentionSentiment)}
                  >
                    <option value="POSITIVE">Positive</option>
                    <option value="NEUTRAL">Neutral</option>
                    <option value="NEGATIVE">Negative</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Response Status</label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formResponseStatus}
                    onChange={(e) => setFormResponseStatus(e.target.value as ResponseStatus)}
                  >
                    <option value="none">No Action</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="replied">Replied</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mentioned At</label>
                  <Input
                    type="datetime-local"
                    value={formMentionedAt}
                    onChange={(e) => setFormMentionedAt(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <Textarea
                placeholder="Private notes (optional)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save Mention
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterSentiment}
              onChange={(e) => setFilterSentiment(e.target.value)}
            >
              <option value="">All Sentiments</option>
              <option value="POSITIVE">Positive</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="NEGATIVE">Negative</option>
            </select>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="none">No Action</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="replied">Replied</option>
              <option value="ignored">Ignored</option>
            </select>
            <Input
              placeholder="Platform filter"
              className="w-36"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
            />
            <Input
              type="date"
              className="w-36"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
            <Input
              type="date"
              className="w-36"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mentions list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : mentions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No brand mentions found. Add your first mention using the button above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mentions.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge className={SENTIMENT_COLORS[m.sentiment]}>
                        {SENTIMENT_LABELS[m.sentiment]}
                      </Badge>
                      <Badge className={RESPONSE_STATUS_COLORS[m.responseStatus]}>
                        {RESPONSE_STATUS_LABELS[m.responseStatus]}
                      </Badge>
                      {m.platform && (
                        <Badge variant="outline" className="text-xs">
                          {m.platform}
                        </Badge>
                      )}
                      {m.authorName && (
                        <span className="text-xs text-muted-foreground">by {m.authorName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.mentionedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">
                      {expandedId === m.id ? m.content : m.content.slice(0, 150) + (m.content.length > 150 ? "…" : "")}
                    </p>
                    {m.content.length > 150 && (
                      <button
                        className="text-xs text-primary mt-1 flex items-center gap-1"
                        onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                      >
                        {expandedId === m.id ? (
                          <><ChevronUp className="h-3 w-3" /> Show less</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> Show more</>
                        )}
                      </button>
                    )}
                    {expandedId === m.id && m.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">Notes: {m.notes}</p>
                    )}
                    {expandedId === m.id && m.relatedPost && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Linked post: {m.relatedPost.content.slice(0, 60)}…
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.mentionUrl && (
                      <a
                        href={m.mentionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                    {/* Quick status change */}
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                      value={m.responseStatus}
                      onChange={(e) => handleUpdateStatus(m.id, e.target.value as ResponseStatus)}
                    >
                      <option value="none">No Action</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="replied">Replied</option>
                      <option value="ignored">Ignored</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                    >
                      {deletingId === m.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => loadMentions(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => loadMentions(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
