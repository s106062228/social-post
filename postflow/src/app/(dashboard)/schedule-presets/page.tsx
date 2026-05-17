"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatPresetLabel } from "@/lib/schedule-time-presets";

interface Preset {
  id: string;
  name: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  timezone: string;
  createdAt: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function SchedulePresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newHour, setNewHour] = useState(9);
  const [newMinute, setNewMinute] = useState(0);
  const [newDays, setNewDays] = useState<number[]>([]);
  const [newTimezone, setNewTimezone] = useState("UTC");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule-presets");
      const data = (await res.json()) as { presets?: Preset[] };
      setPresets(data.presets ?? []);
    } catch {
      toast.error("Failed to load presets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDay(d: number) {
    setNewDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/schedule-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          hour: newHour,
          minute: newMinute,
          daysOfWeek: newDays,
          timezone: newTimezone,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to create preset");
        return;
      }
      toast.success("Preset created");
      setCreating(false);
      setNewName("");
      setNewHour(9);
      setNewMinute(0);
      setNewDays([]);
      setNewTimezone("UTC");
      await load();
    } catch {
      toast.error("Failed to create preset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/schedule-presets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        toast.error("Failed to delete preset");
        return;
      }
      toast.success("Preset deleted");
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error("Failed to delete preset");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule Presets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save named time slots to quickly fill the schedule field in the post
            composer.
          </p>
        </div>
        <Button
          onClick={() => setCreating((v) => !v)}
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Preset
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Preset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Monday Morning"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-1 flex-1">
                <Label>Hour (0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={newHour}
                  onChange={(e) => setNewHour(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label>Minute</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={newMinute}
                  onChange={(e) => setNewMinute(Number(e.target.value))}
                >
                  <option value={0}>:00</option>
                  <option value={15}>:15</option>
                  <option value={30}>:30</option>
                  <option value={45}>:45</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Days of week (leave empty for any day)</Label>
              <div className="flex gap-2 flex-wrap">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-md px-3 py-1 text-xs font-medium border transition-colors ${
                      newDays.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={newTimezone}
                onChange={(e) => setNewTimezone(e.target.value)}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                size="sm"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : presets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No presets yet</p>
            <p className="text-sm text-muted-foreground">
              Create a preset to quickly schedule posts at your favourite times.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => (
            <Card key={preset.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium text-sm">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPresetLabel(preset)} · {preset.timezone}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(preset.id)}
                  disabled={deletingId === preset.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {deletingId === preset.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
