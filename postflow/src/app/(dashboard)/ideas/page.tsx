"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Plus, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type IdeaStatus = "IDEA" | "RESEARCHING" | "DRAFTING" | "REVIEW" | "DONE";
type Platform = "FACEBOOK" | "INSTAGRAM" | "THREADS";

interface ContentIdea {
  id: string;
  title: string;
  description: string | null;
  status: IdeaStatus;
  platform: Platform | null;
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: { status: IdeaStatus; label: string; color: string }[] = [
  { status: "IDEA", label: "Idea", color: "bg-slate-100 dark:bg-slate-800" },
  { status: "RESEARCHING", label: "Researching", color: "bg-blue-50 dark:bg-blue-950" },
  { status: "DRAFTING", label: "Drafting", color: "bg-yellow-50 dark:bg-yellow-950" },
  { status: "REVIEW", label: "Review", color: "bg-orange-50 dark:bg-orange-950" },
  { status: "DONE", label: "Done", color: "bg-green-50 dark:bg-green-950" },
];

const NEXT_STATUS: Record<IdeaStatus, IdeaStatus | null> = {
  IDEA: "RESEARCHING",
  RESEARCHING: "DRAFTING",
  DRAFTING: "REVIEW",
  REVIEW: "DONE",
  DONE: null,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
};

export default function IdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPlatform, setNewPlatform] = useState<Platform | "">("");
  const [showForm, setShowForm] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch("/api/ideas");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { ideas: ContentIdea[] };
      setIdeas(data.ideas);
    } catch {
      toast.error("Failed to load ideas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIdeas();
  }, [fetchIdeas]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          platform: newPlatform || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const idea = (await res.json()) as ContentIdea;
      setIdeas((prev) => [idea, ...prev]);
      setNewTitle("");
      setNewDescription("");
      setNewPlatform("");
      setShowForm(false);
      toast.success("Idea created");
    } catch {
      toast.error("Failed to create idea");
    } finally {
      setCreating(false);
    }
  }

  async function handleMove(idea: ContentIdea) {
    const next = NEXT_STATUS[idea.status];
    if (!next) return;
    setMovingId(idea.id);
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Failed to move");
      const updated = (await res.json()) as ContentIdea;
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? updated : i)));
      toast.success(`Moved to ${COLUMNS.find((c) => c.status === next)?.label}`);
    } catch {
      toast.error("Failed to move idea");
    } finally {
      setMovingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setIdeas((prev) => prev.filter((i) => i.id !== id));
      toast.success("Idea deleted");
    } catch {
      toast.error("Failed to delete idea");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConvertToPost(id: string) {
    setConvertingId(id);
    try {
      const res = await fetch(`/api/ideas/${id}/to-post`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to convert");
      const data = (await res.json()) as { postId: string };
      toast.success("Draft post created — redirecting…");
      router.push(`/posts/${data.postId}/versions`);
    } catch {
      toast.error("Failed to convert idea to post");
      setConvertingId(null);
    }
  }

  const ideasByStatus = (status: IdeaStatus) =>
    ideas.filter((i) => i.status === status);

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Ideas</h1>
          <p className="text-muted-foreground">
            Capture and develop content ideas through your workflow.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New Idea
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>New content idea</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <Input
                placeholder="Idea title *"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                required
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                maxLength={2000}
              />
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as Platform | "")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Platform (any)</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="THREADS">Threads</option>
              </select>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating || !newTitle.trim()} size="sm">
                  {creating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Create
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ideas…
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(({ status, label, color }) => {
            const columnIdeas = ideasByStatus(status);
            return (
              <div
                key={status}
                className={`flex w-72 shrink-0 flex-col gap-3 rounded-lg p-3 ${color}`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-1">
                  <span className="font-semibold text-sm">{label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {columnIdeas.length}
                  </Badge>
                </div>

                {/* Cards */}
                {columnIdeas.length === 0 ? (
                  <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-center text-xs text-muted-foreground">
                    No ideas here
                  </div>
                ) : (
                  columnIdeas.map((idea) => (
                    <Card key={idea.id} className="shadow-sm">
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug break-words flex-1">
                            {idea.title}
                          </p>
                          <button
                            onClick={() => handleDelete(idea.id)}
                            disabled={deletingId === idea.id}
                            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Delete idea"
                          >
                            {deletingId === idea.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>

                        {idea.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {idea.description}
                          </p>
                        )}

                        {idea.platform && (
                          <Badge variant="outline" className="text-xs w-fit">
                            {PLATFORM_LABELS[idea.platform]}
                          </Badge>
                        )}

                        {idea.dueDate && (
                          <p className="text-xs text-muted-foreground">
                            Due:{" "}
                            {new Date(idea.dueDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-1 pt-1">
                          {NEXT_STATUS[idea.status] !== null && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              disabled={movingId === idea.id}
                              onClick={() => handleMove(idea)}
                            >
                              {movingId === idea.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <ArrowRight className="mr-1 h-3 w-3" />
                                  Move
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={convertingId === idea.id}
                            onClick={() => handleConvertToPost(idea.id)}
                          >
                            {convertingId === idea.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Lightbulb className="mr-1 h-3 w-3" />
                                To Post
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
