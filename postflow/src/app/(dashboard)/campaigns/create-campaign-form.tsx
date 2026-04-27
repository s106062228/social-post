"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface FormData {
  name: string;
  description: string;
  goal: string;
  startDate: string;
  endDate: string;
}

export function CreateCampaignForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    description: "",
    goal: "",
    startDate: "",
    endDate: "",
  });

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setLoading(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim() };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.goal.trim()) body.goal = form.goal.trim();
      if (form.startDate) body.startDate = new Date(form.startDate).toISOString();
      if (form.endDate) body.endDate = new Date(form.endDate).toISOString();

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create campaign");
      }

      toast({ title: "Campaign created", variant: "success" });
      setForm({ name: "", description: "", goal: "", startDate: "", endDate: "" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to create campaign",
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
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          placeholder="Summer Launch Campaign"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="What is this campaign about?"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal">Goal</Label>
        <Input
          id="goal"
          placeholder="Increase brand awareness by 20%"
          value={form.goal}
          onChange={(e) => handleChange("goal", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            type="date"
            value={form.startDate}
            onChange={(e) => handleChange("startDate", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            type="date"
            value={form.endDate}
            onChange={(e) => handleChange("endDate", e.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading || !form.name.trim()}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create campaign
      </Button>
    </form>
  );
}
