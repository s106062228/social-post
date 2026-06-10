"use client";

import { useState } from "react";
import { NotebookPen, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type JournalEntryType = "SUCCESS" | "FAILURE" | "INSIGHT" | "HYPOTHESIS" | "EXPERIMENT";

interface Props {
  postId: string;
  postContentPreview: string;
}

const TYPE_LABELS: Record<JournalEntryType, string> = {
  SUCCESS: "✅ Success",
  FAILURE: "❌ Failure",
  INSIGHT: "💡 Insight",
  HYPOTHESIS: "🔬 Hypothesis",
  EXPERIMENT: "🧪 Experiment",
};

export function AddToJournalButton({ postId, postContentPreview }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState<JournalEntryType>("INSIGHT");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          entryType,
          content: content.trim(),
          postId,
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved to journal");
      setOpen(false);
      setTitle("");
      setContent("");
      setTags("");
    } catch {
      toast.error("Failed to save to journal");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Add to Journal">
        <NotebookPen className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <NotebookPen className="h-4 w-4" />
            Add to Journal
          </h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground bg-muted rounded p-2 line-clamp-2">
          Post: &ldquo;{postContentPreview}&rdquo;
        </p>

        <Input
          placeholder="Entry title (e.g. Viral video experiment results)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TYPE_LABELS) as JournalEntryType[]).map(t => (
            <button
              key={t}
              onClick={() => setEntryType(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                entryType === t ? "bg-primary text-primary-foreground border-transparent" : "border-border hover:bg-muted"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <Textarea
          placeholder="What did you learn? What worked or didn't? Key observations..."
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={4}
        />

        <Input
          placeholder="Tags (comma-separated, e.g. video, hashtags, engagement)"
          value={tags}
          onChange={e => setTags(e.target.value)}
        />

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save to Journal
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
