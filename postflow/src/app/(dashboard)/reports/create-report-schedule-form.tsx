"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReportFrequency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

export function CreateReportScheduleForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<ReportFrequency>(ReportFrequency.WEEKLY);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Recipient email is required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/report-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency, recipientEmail: email.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create schedule");
      }

      toast({ title: "Report schedule created", variant: "success" });
      setEmail("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to create schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipientEmail">Recipient email</Label>
        <Input
          id="recipientEmail"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="frequency">Frequency</Label>
        <select
          id="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ReportFrequency)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {Object.values(ReportFrequency).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={loading} className="self-start">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create schedule
      </Button>
    </form>
  );
}
