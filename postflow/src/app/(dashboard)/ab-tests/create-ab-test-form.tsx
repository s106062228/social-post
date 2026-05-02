"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Post {
  id: string;
  content: string;
  status: string;
}

interface CreateABTestFormProps {
  posts: Post[];
}

export function CreateABTestForm({ posts }: CreateABTestFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [postAId, setPostAId] = useState("");
  const [postBId, setPostBId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !postAId || !postBId) return;
    if (postAId === postBId) {
      toast({ title: "Variant A and B must be different posts", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), postAId, postBId }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create A/B test");
      }

      toast({ title: "A/B test created", variant: "success" });
      setName("");
      setPostAId("");
      setPostBId("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to create A/B test",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const availableForB = posts.filter((p) => p.id !== postAId);
  const availableForA = posts.filter((p) => p.id !== postBId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ab-name">Test name *</Label>
        <Input
          id="ab-name"
          placeholder="CTA button copy test"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-a">Variant A *</Label>
          <select
            id="post-a"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={postAId}
            onChange={(e) => setPostAId(e.target.value)}
            required
          >
            <option value="">Select a post…</option>
            {availableForA.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.status}] {p.content.slice(0, 60)}{p.content.length > 60 ? "…" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-b">Variant B *</Label>
          <select
            id="post-b"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={postBId}
            onChange={(e) => setPostBId(e.target.value)}
            required
          >
            <option value="">Select a post…</option>
            {availableForB.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.status}] {p.content.slice(0, 60)}{p.content.length > 60 ? "…" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading || !name.trim() || !postAId || !postBId || postAId === postBId}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create A/B test
      </Button>
    </form>
  );
}
