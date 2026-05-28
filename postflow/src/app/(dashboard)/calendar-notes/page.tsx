"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, StickyNote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CalendarNote {
  id: string;
  date: string;
  title: string;
  body?: string | null;
  color: string;
  createdAt: string;
}

const NOTE_COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#ef4444", label: "Red" },
];

export default function CalendarNotesPage() {
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formColor, setFormColor] = useState(NOTE_COLORS[0].value);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar-notes")
      .then((r) => r.json())
      .then((d: { notes?: CalendarNote[] }) => setNotes(d.notes ?? []))
      .catch(() =>
        toast({ title: "Error", description: "Could not load notes", variant: "destructive" })
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate || !formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formDate,
          title: formTitle.trim(),
          body: formBody.trim() || undefined,
          color: formColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to create note");
      }
      const data = await res.json() as { note: CalendarNote };
      setNotes((prev) =>
        [data.note, ...prev].sort((a, b) => a.date.localeCompare(b.date))
      );
      setFormDate("");
      setFormTitle("");
      setFormBody("");
      setFormColor(NOTE_COLORS[0].value);
      setShowForm(false);
      toast({ title: "Note added" });
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/calendar-notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast({ title: "Note deleted" });
    } catch {
      toast({
        title: "Error",
        description: "Could not delete note",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Day Notes</h1>
          <p className="text-muted-foreground">
            Plan and annotate specific calendar days with reminders and context.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Note
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">New Day Note</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="note-date">Date</Label>
                <Input
                  id="note-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-transform",
                        formColor === c.value
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setFormColor(c.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Product launch, Holiday, Campaign starts"
                maxLength={200}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="note-body">Notes (optional)</Label>
              <Textarea
                id="note-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Additional details or reminders..."
                maxLength={2000}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving || !formDate || !formTitle.trim()}
              >
                {saving ? "Saving…" : "Save Note"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <StickyNote className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No day notes yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add notes to mark important dates on your calendar — launches,
            holidays, campaign milestones, and more.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th className="py-3 px-4 text-left font-medium">Date</th>
                <th className="py-3 px-4 text-left font-medium">Title</th>
                <th className="py-3 px-4 text-left font-medium">Notes</th>
                <th className="py-3 px-4 text-left font-medium">Color</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-4 text-sm font-mono">{note.date}</td>
                  <td className="py-3 px-4 text-sm font-medium">{note.title}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate">
                    {note.body ?? "—"}
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant="outline"
                      className="gap-1.5"
                      style={{ borderColor: note.color, color: note.color }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: note.color }}
                      />
                      {NOTE_COLORS.find((c) => c.value === note.color)?.label ??
                        note.color}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deletingId === note.id}
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
