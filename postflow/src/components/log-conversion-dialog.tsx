"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const CONVERSION_TYPES = [
  { value: "SALE", label: "Sale" },
  { value: "LEAD", label: "Lead" },
  { value: "SIGNUP", label: "Sign-up" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "CLICK", label: "Click" },
  { value: "OTHER", label: "Other" },
] as const;

interface LogConversionDialogProps {
  postId: string;
  onLogged?: () => void;
  onClose: () => void;
}

export function LogConversionDialog({
  postId,
  onLogged,
  onClose,
}: LogConversionDialogProps) {
  const [type, setType] = useState<string>("SALE");
  const [value, setValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = { type };
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > 0) {
          body.value = numValue;
        }
        if (notes.trim()) body.notes = notes.trim();
        if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();

        const res = await fetch(`/api/posts/${postId}/conversions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? "Failed to log conversion"
          );
        }

        toast({ title: "Conversion logged successfully" });
        onLogged?.();
        onClose();
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to log conversion",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Log Conversion</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Conversion Type <span className="text-destructive">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CONVERSION_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Revenue value */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Revenue (USD){" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 49.99"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Notes{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Add any additional context…"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {notes.length}/1000
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Date{" "}
              <span className="text-muted-foreground">
                (optional, defaults to now)
              </span>
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Log Conversion"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
