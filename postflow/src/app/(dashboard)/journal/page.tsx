"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  Search,
  Star,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type JournalEntryType = "SUCCESS" | "FAILURE" | "INSIGHT" | "HYPOTHESIS" | "EXPERIMENT";

interface Post {
  id: string;
  content: string;
  status: string;
}

interface JournalEntry {
  id: string;
  title: string;
  entryType: JournalEntryType;
  content: string;
  postId: string | null;
  post: Post | null;
  rating: number | null;
  tags: string[];
  isPublicToTeam: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  byType: Record<JournalEntryType, number>;
  topTags: { tag: string; count: number }[];
  avgRating: number | null;
}

const TYPE_LABELS: Record<JournalEntryType, string> = {
  SUCCESS: "Success",
  FAILURE: "Failure",
  INSIGHT: "Insight",
  HYPOTHESIS: "Hypothesis",
  EXPERIMENT: "Experiment",
};

const TYPE_COLORS: Record<JournalEntryType, string> = {
  SUCCESS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  FAILURE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  INSIGHT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HYPOTHESIS: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  EXPERIMENT: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const TYPE_ICONS: Record<JournalEntryType, string> = {
  SUCCESS: "✅",
  FAILURE: "❌",
  INSIGHT: "💡",
  HYPOTHESIS: "🔬",
  EXPERIMENT: "🧪",
};

const ENTRY_TYPES: JournalEntryType[] = ["SUCCESS", "FAILURE", "INSIGHT", "HYPOTHESIS", "EXPERIMENT"];

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<JournalEntryType | "">("");
  const [filterTag, setFilterTag] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<JournalEntryType>("INSIGHT");
  const [newContent, setNewContent] = useState("");
  const [newRating, setNewRating] = useState<number | "">("");
  const [newTags, setNewTags] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editRating, setEditRating] = useState<number | "">("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (search) params.set("search", search);
    if (filterType) params.set("entryType", filterType);
    if (filterTag) params.set("tag", filterTag);

    const res = await fetch(`/api/journal?${params}`);
    if (res.ok) {
      const data = await res.json() as { entries: JournalEntry[] };
      setEntries(data.entries);
    }
  }, [search, filterType, filterTag]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/journal/stats");
    if (res.ok) {
      const data = await res.json() as Stats;
      setStats(data);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEntries(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchEntries, fetchStats]);

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      const tags = newTags.split(",").map(t => t.trim()).filter(Boolean);
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          entryType: newType,
          content: newContent.trim(),
          rating: newRating || undefined,
          tags,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Journal entry created");
      setNewTitle("");
      setNewContent("");
      setNewRating("");
      setNewTags("");
      setShowCreate(false);
      await Promise.all([fetchEntries(), fetchStats()]);
    } catch {
      toast.error("Failed to create entry");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditRating(entry.rating ?? "");
    setEditTags(entry.tags.join(", "));
    setExpandedId(entry.id);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      const tags = editTags.split(",").map(t => t.trim()).filter(Boolean);
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          rating: editRating || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Entry updated");
      setEditingId(null);
      await fetchEntries();
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this journal entry?")) return;
    const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry deleted");
      await Promise.all([fetchEntries(), fetchStats()]);
    } else {
      toast.error("Failed to delete");
    }
  }

  function renderStars(rating: number | null, size = "text-sm") {
    if (!rating) return null;
    return (
      <span className={`text-yellow-500 ${size}`}>
        {"★".repeat(rating)}{"☆".repeat(5 - rating)}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Content Journal
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Capture learnings, insights, and reflections from your content performance
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Entry
        </Button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ENTRY_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? "" : t)}
              className={`rounded-lg border p-3 text-left transition-colors ${filterType === t ? "ring-2 ring-primary" : "hover:bg-muted"}`}
            >
              <div className="text-lg">{TYPE_ICONS[t]}</div>
              <div className="text-xl font-bold">{stats.byType[t] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{TYPE_LABELS[t]}</div>
            </button>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Entry title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <div className="flex gap-2 flex-wrap">
              {ENTRY_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    newType === t ? TYPE_COLORS[t] + " border-transparent" : "border-border hover:bg-muted"
                  }`}
                >
                  {TYPE_ICONS[t]} {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="What did you learn? What happened? Describe the context and key takeaway..."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={5}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rating (optional)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setNewRating(newRating === n ? "" : n)}
                      className={`text-xl ${(newRating as number) >= n ? "text-yellow-500" : "text-gray-300"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                <Input
                  placeholder="e.g. video, engagement, hashtags"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating || !newTitle.trim() || !newContent.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Entry
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {filterType && (
          <Badge
            variant="secondary"
            className={`flex items-center gap-1 cursor-pointer ${TYPE_COLORS[filterType]}`}
            onClick={() => setFilterType("")}
          >
            {TYPE_ICONS[filterType]} {TYPE_LABELS[filterType]}
            <X className="h-3 w-3" />
          </Badge>
        )}
        {filterTag && (
          <Badge variant="secondary" className="flex items-center gap-1 cursor-pointer" onClick={() => setFilterTag("")}>
            #{filterTag} <X className="h-3 w-3" />
          </Badge>
        )}
      </div>

      {/* Top tags */}
      {stats && stats.topTags.length > 0 && !filterTag && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground self-center">Popular tags:</span>
          {stats.topTags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className="text-xs px-2 py-0.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
            >
              #{tag} <span className="text-muted-foreground">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No journal entries yet</p>
            <p className="text-sm mt-1">
              Start capturing your content learnings by clicking &quot;New Entry&quot; above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <Card key={entry.id} className="overflow-hidden">
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <span className="text-2xl mt-0.5">{TYPE_ICONS[entry.entryType]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editingId === entry.id ? (
                      <Input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="text-base font-semibold h-7 w-full max-w-md"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-semibold text-base">{entry.title}</span>
                    )}
                    <Badge className={`text-xs ${TYPE_COLORS[entry.entryType]}`}>
                      {TYPE_LABELS[entry.entryType]}
                    </Badge>
                    {entry.rating && renderStars(entry.rating)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {entry.post && (
                      <a
                        href={`/posts`}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Linked post
                      </a>
                    )}
                    {entry.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={e => { e.stopPropagation(); setFilterTag(tag); }}
                        className="text-xs text-primary hover:underline"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editingId !== entry.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); startEdit(entry); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {expandedId === entry.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {expandedId === entry.id && (
                <div className="px-4 pb-4 border-t">
                  {editingId === entry.id ? (
                    <div className="space-y-3 pt-3">
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={6}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                onClick={() => setEditRating(editRating === n ? "" : n)}
                                className={`text-xl ${(editRating as number) >= n ? "text-yellow-500" : "text-gray-300"}`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
                          <Input
                            value={editTags}
                            onChange={e => setEditTags(e.target.value)}
                            placeholder="tag1, tag2, ..."
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(entry.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap pt-3 leading-relaxed">
                      {entry.content}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
