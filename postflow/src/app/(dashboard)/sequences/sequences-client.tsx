"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Pause,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
  Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type SequenceStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

interface SequenceStep {
  id: string;
  stepOrder: number;
  delayDays: number;
  content: string;
  mediaType: string;
  platforms: string[];
  postId?: string | null;
}

interface Sequence {
  id: string;
  name: string;
  description?: string | null;
  status: SequenceStatus;
  startDate?: string | null;
  timezone: string;
  steps: SequenceStep[];
  createdAt: string;
}

function statusColor(status: SequenceStatus) {
  switch (status) {
    case "ACTIVE": return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    case "PAUSED": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
    case "DRAFT": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "COMPLETED": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "CANCELLED": return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  }
}

function CreateSequenceDialog({ onCreated }: { onCreated: (s: Sequence) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      onCreated(data.sequence);
      toast.success("Sequence created");
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create sequence");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Sequence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post Sequence</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <Label htmlFor="seq-name">Name *</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Launch Campaign"
            />
          </div>
          <div>
            <Label htmlFor="seq-desc">Description</Label>
            <Textarea
              id="seq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddStepDialog({
  sequenceId,
  onAdded,
}: {
  sequenceId: string;
  onAdded: (step: SequenceStep) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [delayDays, setDelayDays] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), delayDays }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      onAdded(data.step);
      toast.success("Step added");
      setOpen(false);
      setContent("");
      setDelayDays(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add step");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3 w-3" /> Add Step
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Sequence Step</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <Label htmlFor="step-content">Post Content *</Label>
            <Textarea
              id="step-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post content..."
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="step-delay">Delay (days from sequence start)</Label>
            <Input
              id="step-delay"
              type="number"
              min={0}
              max={3650}
              value={delayDays}
              onChange={(e) => setDelayDays(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              0 = publish on start date
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={loading || !content.trim()}>
              {loading ? "Adding..." : "Add Step"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StartSequenceDialog({
  sequence,
  onStarted,
}: {
  sequence: Sequence;
  onStarted: (s: Sequence) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sequences/${sequence.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: new Date(startDate).toISOString() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast.success(`Sequence started — ${data.postsCreated} posts scheduled`);
      setOpen(false);
      // Refresh the sequence
      const seqRes = await fetch(`/api/sequences/${sequence.id}`);
      if (seqRes.ok) {
        const seqData = await seqRes.json();
        onStarted(seqData.sequence);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start sequence");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Play className="mr-1 h-3 w-3" /> Start
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Sequence: {sequence.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-muted-foreground">
            This will create {sequence.steps.length} scheduled post
            {sequence.steps.length !== 1 ? "s" : ""} based on each step&apos;s delay.
          </p>
          <div>
            <Label htmlFor="start-date">Start Date &amp; Time</Label>
            <Input
              id="start-date"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="bg-muted rounded-md p-3 text-sm space-y-1">
            {sequence.steps.map((step) => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + step.delayDays);
              return (
                <div key={step.id} className="flex items-center justify-between">
                  <span className="truncate max-w-[200px]">{step.content.slice(0, 40)}…</span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    Day +{step.delayDays} ({d.toLocaleDateString()})
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={loading}>
              {loading ? "Starting..." : "Start Sequence"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SequenceCard({
  sequence: initialSequence,
  onDelete,
}: {
  sequence: Sequence;
  onDelete: (id: string) => void;
}) {
  const [sequence, setSequence] = useState(initialSequence);
  const [expanded, setExpanded] = useState(false);

  async function handlePause() {
    try {
      const res = await fetch(`/api/sequences/${sequence.id}/pause`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setSequence(data.sequence);
      toast.success("Sequence paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to pause");
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this sequence? Scheduled posts will revert to drafts.")) return;
    try {
      const res = await fetch(`/api/sequences/${sequence.id}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Sequence cancelled");
      const updated = { ...sequence, status: "CANCELLED" as SequenceStatus };
      setSequence(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this sequence permanently?")) return;
    try {
      const res = await fetch(`/api/sequences/${sequence.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Sequence deleted");
      onDelete(sequence.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleDeleteStep(stepId: string) {
    try {
      const res = await fetch(`/api/sequences/${sequence.id}/steps/${stepId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSequence((prev) => ({
        ...prev,
        steps: prev.steps.filter((s) => s.id !== stepId),
      }));
      toast.success("Step removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove step");
    }
  }

  const canStart = sequence.status === "DRAFT" || sequence.status === "PAUSED";
  const canPause = sequence.status === "ACTIVE";
  const canCancel = sequence.status === "ACTIVE" || sequence.status === "PAUSED";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{sequence.name}</CardTitle>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(sequence.status)}`}>
                {sequence.status}
              </span>
            </div>
            {sequence.description && (
              <CardDescription className="mt-1">{sequence.description}</CardDescription>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {sequence.steps.length} step{sequence.steps.length !== 1 ? "s" : ""} ·{" "}
              Created {formatDistanceToNow(new Date(sequence.createdAt), { addSuffix: true })}
              {sequence.startDate && (
                <> · Started {new Date(sequence.startDate).toLocaleDateString()}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canStart && sequence.steps.length > 0 && (
              <StartSequenceDialog sequence={sequence} onStarted={setSequence} />
            )}
            {canPause && (
              <Button size="sm" variant="outline" onClick={handlePause}>
                <Pause className="mr-1 h-3 w-3" /> Pause
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="mr-1 h-3 w-3" /> Cancel
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Steps</h4>
            {sequence.status === "DRAFT" && (
              <AddStepDialog
                sequenceId={sequence.id}
                onAdded={(step) =>
                  setSequence((prev) => ({
                    ...prev,
                    steps: [...prev.steps, step].sort((a, b) => a.stepOrder - b.stepOrder),
                  }))
                }
              />
            )}
          </div>

          {sequence.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No steps yet. Add steps to define your sequence.
            </p>
          ) : (
            <div className="space-y-2">
              {sequence.steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="mr-1 h-3 w-3" />
                        Day +{step.delayDays}
                      </Badge>
                      {step.postId && (
                        <Badge variant="outline" className="text-xs text-green-600">
                          Post created
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2 text-muted-foreground">
                      {step.content}
                    </p>
                  </div>
                  {sequence.status === "DRAFT" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive shrink-0"
                      onClick={() => handleDeleteStep(step.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function SequencesClient({ initialSequences }: { initialSequences: Sequence[] }) {
  const [sequences, setSequences] = useState(initialSequences);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Post Sequences</h1>
          <p className="text-muted-foreground">
            Build drip campaigns — a series of posts that auto-schedule with time delays.
          </p>
        </div>
        <CreateSequenceDialog
          onCreated={(seq) => setSequences((prev) => [seq, ...prev])}
        />
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sequences yet</h3>
            <p className="text-muted-foreground max-w-sm mb-4">
              Create a post sequence to automate a series of posts with preset time delays —
              perfect for product launches, onboarding flows, and campaigns.
            </p>
            <CreateSequenceDialog
              onCreated={(seq) => setSequences((prev) => [seq, ...prev])}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => (
            <SequenceCard
              key={seq.id}
              sequence={seq}
              onDelete={(id) => setSequences((prev) => prev.filter((s) => s.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
