"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Trash2, Clock, Plus, CalendarClock } from "lucide-react";
import type { Platform } from "@prisma/client";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
};

interface QueueSlot {
  id: string;
  label: string;
  platform: Platform | null;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  isActive: boolean;
}

interface Props {
  initialSlots: QueueSlot[];
  upcomingSlots: string[];
  timezone: string;
}

export function QueuePageClient({ initialSlots, upcomingSlots, timezone }: Props) {
  const [slots, setSlots] = useState<QueueSlot[]>(initialSlots);
  const [upcoming] = useState<Date[]>(upcomingSlots.map((s) => new Date(s)));

  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function addSlot() {
    setSaving(true);
    try {
      const res = await fetch("/api/queue-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          platform: platform || null,
          hour,
          minute,
          daysOfWeek: Array.from(selectedDays).sort(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create slot");
      }
      const created = (await res.json()) as QueueSlot;
      setSlots((prev) => [...prev, created].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
      setLabel("");
      toast({ title: "Queue slot added", variant: "success" });
    } catch (err) {
      toast({
        title: "Failed to add slot",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlot(id: string) {
    try {
      const res = await fetch(`/api/queue-slots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setSlots((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Slot removed", variant: "success" });
    } catch {
      toast({ title: "Failed to remove slot", variant: "destructive" });
    }
  }

  const timeLabel = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  const daysLabel = (days: number[]) =>
    days.length === 0 ? "Every day" : days.map((d) => DAY_LABELS[d] ?? "?").join(", ");

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Posting Queue</h1>
        <p className="text-muted-foreground">
          Define time windows — then use &ldquo;Add to Queue&rdquo; in the composer to auto-schedule
          posts into the next free slot. Timezone: <strong>{timezone}</strong>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Existing slots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Time Windows
            </CardTitle>
            <CardDescription>Your configured posting time slots</CardDescription>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No slots yet. Add one below.
              </p>
            ) : (
              <ul className="divide-y">
                {slots.map((slot) => (
                  <li key={slot.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {timeLabel(slot.hour, slot.minute)}
                        {slot.label && (
                          <span className="ml-2 text-muted-foreground font-normal">
                            {slot.label}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {daysLabel(slot.daysOfWeek)}
                        {slot.platform && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                            {PLATFORM_LABELS[slot.platform]}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => deleteSlot(slot.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Next 7 Upcoming Slots
            </CardTitle>
            <CardDescription>Preview of your next available posting windows</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming slots — add time windows first.
              </p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((d, i) => (
                  <li key={i} className="py-2.5 text-sm">
                    {d.toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add slot form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Time Window
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-hour">Hour (0–23)</Label>
              <Input
                id="slot-hour"
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-minute">Minute</Label>
              <select
                id="slot-minute"
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-platform">Platform (optional)</Label>
              <select
                id="slot-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | "")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All platforms</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="THREADS">Threads</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-label">Label (optional)</Label>
              <Input
                id="slot-label"
                placeholder="e.g. Morning post"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Label>Days of week (empty = every day)</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    selectedDays.has(idx)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {name}
                </button>
              ))}
              {selectedDays.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDays(new Set())}
                  className="rounded-full border border-input bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  Clear (every day)
                </button>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={addSlot} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Adding…" : "Add slot"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
