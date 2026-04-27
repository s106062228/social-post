"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function CreateFeedForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [autoCreate, setAutoCreate] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/rss-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), autoCreate }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({ title: "Error", description: data.error ?? "Failed to add feed", variant: "destructive" });
        return;
      }
      toast({ title: "Feed added", description: `"${name}" has been added.` });
      setName("");
      setUrl("");
      setAutoCreate(true);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rss-name">Feed name</Label>
        <Input
          id="rss-name"
          placeholder="e.g. Tech Crunch"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rss-url">Feed URL</Label>
        <Input
          id="rss-url"
          type="url"
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          maxLength={2000}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="rss-autocreate"
          type="checkbox"
          checked={autoCreate}
          onChange={(e) => setAutoCreate(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <Label htmlFor="rss-autocreate" className="cursor-pointer font-normal">
          Automatically create draft posts from new items
        </Label>
      </div>

      <Button type="submit" disabled={loading || !name || !url} className="self-start">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Add feed
      </Button>
    </form>
  );
}
