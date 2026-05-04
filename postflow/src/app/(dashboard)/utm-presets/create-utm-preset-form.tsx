"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function CreateUtmPresetForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    source: "",
    medium: "",
    campaign: "",
    content: "",
    term: "",
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.source.trim() || !form.medium.trim()) {
      toast({ title: "Name, source, and medium are required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/utm-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          source: form.source.trim(),
          medium: form.medium.trim(),
          campaign: form.campaign.trim() || null,
          content: form.content.trim() || null,
          term: form.term.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({ title: data.error ?? "Failed to create preset.", variant: "destructive" });
        return;
      }

      toast({ title: "UTM preset created.", variant: "success" });
      setForm({ name: "", source: "", medium: "", campaign: "", content: "", term: "" });
      router.refresh();
    } catch {
      toast({ title: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="utm-name">Name *</Label>
        <Input
          id="utm-name"
          placeholder="e.g. Social — June Campaign"
          value={form.name}
          onChange={set("name")}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="utm-source">Source *</Label>
          <Input
            id="utm-source"
            placeholder="e.g. facebook"
            value={form.source}
            onChange={set("source")}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-medium">Medium *</Label>
          <Input
            id="utm-medium"
            placeholder="e.g. social"
            value={form.medium}
            onChange={set("medium")}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="utm-campaign">Campaign</Label>
          <Input
            id="utm-campaign"
            placeholder="e.g. summer_sale"
            value={form.campaign}
            onChange={set("campaign")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-content">Content</Label>
          <Input
            id="utm-content"
            placeholder="e.g. post_link"
            value={form.content}
            onChange={set("content")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-term">Term</Label>
          <Input
            id="utm-term"
            placeholder="e.g. keyword"
            value={form.term}
            onChange={set("term")}
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create preset
      </Button>
    </form>
  );
}
