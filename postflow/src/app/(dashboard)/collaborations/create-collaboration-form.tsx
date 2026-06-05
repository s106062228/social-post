"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const PLATFORMS = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
  "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM",
  "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST", "DEVTO",
  "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
];

export function CreateCollaborationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerHandle, setPartnerHandle] = useState("");
  const [platform, setPlatform] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !partnerName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          partnerName: partnerName.trim(),
          partnerHandle: partnerHandle.trim() || undefined,
          platform: platform || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          budget: budget ? parseFloat(budget) : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Error", description: data.error ?? "Failed to create collaboration", variant: "destructive" });
        return;
      }

      toast({ title: "Collaboration created" });
      setName("");
      setPartnerName("");
      setPartnerHandle("");
      setPlatform("");
      setStartDate("");
      setEndDate("");
      setBudget("");
      setNotes("");
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="collab-name">Collaboration name *</Label>
          <Input
            id="collab-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer Campaign"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-name">Partner name *</Label>
          <Input
            id="partner-name"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-handle">Partner handle</Label>
          <Input
            id="partner-handle"
            value={partnerHandle}
            onChange={(e) => setPartnerHandle(e.target.value)}
            placeholder="@janedoe"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="collab-platform">Platform</Label>
          <select
            id="collab-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Any platform —</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase().replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-date">Start date</Label>
          <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value).toISOString() : "")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end-date">End date</Label>
          <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value).toISOString() : "")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget">Budget (USD)</Label>
        <Input
          id="budget"
          type="number"
          min="0"
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="500.00"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Deliverables, terms, contact info..."
          rows={3}
        />
      </div>

      <Button type="submit" disabled={loading || !name.trim() || !partnerName.trim()} className="self-start">
        {loading ? "Creating..." : "Create collaboration"}
      </Button>
    </form>
  );
}
