"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trophy } from "lucide-react";

interface ConcludeTestFormProps {
  testId: string;
}

export function ConcludeTestForm({ testId }: ConcludeTestFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState<"A" | "B" | "INCONCLUSIVE">("A");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/ab-tests/${testId}/conclude`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner, notes: notes.trim() || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to conclude test");
      }

      toast({ title: "Test concluded", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to conclude test",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Winner</Label>
        <div className="flex gap-2">
          {(["A", "B", "INCONCLUSIVE"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setWinner(opt)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                winner === opt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {opt === "INCONCLUSIVE" ? "Inconclusive" : `Variant ${opt}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          placeholder="What did you learn from this test?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-fit">
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Trophy className="mr-2 h-4 w-4" />
        )}
        Conclude test
      </Button>
    </form>
  );
}
