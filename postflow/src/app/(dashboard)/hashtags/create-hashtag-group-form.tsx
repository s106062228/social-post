"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function CreateHashtagGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function addHashtag() {
    const raw = hashtagInput.trim();
    if (!raw) return;
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!hashtags.includes(tag) && hashtags.length < 30) {
      setHashtags((prev) => [...prev, tag]);
    }
    setHashtagInput("");
  }

  function removeHashtag(tag: string) {
    setHashtags((prev) => prev.filter((h) => h !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || hashtags.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), hashtags }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create group");
      }
      toast({ title: "Hashtag group created", variant: "success" });
      setName("");
      setHashtags([]);
      setHashtagInput("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Create failed",
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
        <Label htmlFor="group-name">Group name</Label>
        <Input
          id="group-name"
          placeholder="e.g. Marketing, Product Launch…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hashtag-input">
          Hashtags{" "}
          <span className="font-normal text-muted-foreground">
            (press Enter or comma to add)
          </span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="hashtag-input"
            placeholder="#yourhashtag"
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={100}
          />
          <Button type="button" variant="outline" size="icon" onClick={addHashtag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeHashtag(tag)}
                  className="ml-0.5 rounded-full hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {tag}</span>
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{hashtags.length}/30 hashtags</p>
      </div>

      <Button
        type="submit"
        disabled={loading || !name.trim() || hashtags.length === 0}
        className="self-start"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create group
      </Button>
    </form>
  );
}
