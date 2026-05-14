"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, CalendarOff } from "lucide-react";
import { toast } from "sonner";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BlackoutPeriod {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  isRecurring: boolean;
  daysOfWeek: number[];
  createdAt: Date | string;
}

interface Props {
  initialPeriods: BlackoutPeriod[];
}

export function BlackoutPeriodsClient({ initialPeriods }: Props) {
  const [periods, setPeriods] = useState<BlackoutPeriod[]>(initialPeriods);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  function toggleDay(day: number) {
    setSelectedDays((prev: number[]) =>
      prev.includes(day) ? prev.filter((d: number) => d !== day) : [...prev, day]
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (isRecurring && selectedDays.length === 0) {
      toast.error("Select at least one day for recurring blackouts");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/blackout-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          isRecurring,
          daysOfWeek: isRecurring ? selectedDays : [],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create blackout period");
        return;
      }

      const created = await res.json() as BlackoutPeriod;
      setPeriods((prev: BlackoutPeriod[]) => [...prev, created]);
      setName("");
      setStartDate("");
      setEndDate("");
      setIsRecurring(false);
      setSelectedDays([]);
      setShowForm(false);
      toast.success("Blackout period created");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this blackout period?")) return;
    const res = await fetch(`/api/blackout-periods/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete blackout period");
      return;
    }
    setPeriods((prev: BlackoutPeriod[]) => prev.filter((p: BlackoutPeriod) => p.id !== id));
    toast.success("Blackout period deleted");
  }

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {periods.length} blackout period{periods.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          {showForm ? "Cancel" : "Add Period"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="bp-name">Name</Label>
              <Input
                id="bp-name"
                placeholder="e.g. Christmas Break, Launch Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bp-start">Start Date &amp; Time</Label>
                <Input
                  id="bp-start"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bp-end">End Date &amp; Time</Label>
                <Input
                  id="bp-end"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="bp-recurring"
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="bp-recurring" className="cursor-pointer">
                Recurring weekly blackout
              </Label>
            </div>

            {isRecurring && (
              <div className="flex flex-col gap-2">
                <Label>Days of week</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selectedDays.includes(i)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleCreate} disabled={saving} className="self-start">
              {saving ? "Creating…" : "Create Blackout Period"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {periods.map((period) => (
          <Card key={period.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{period.name}</span>
                  {period.isRecurring && (
                    <Badge variant="secondary" className="text-xs">
                      Recurring
                    </Badge>
                  )}
                </div>
                {period.isRecurring ? (
                  <p className="text-xs text-muted-foreground ml-6">
                    Every{" "}
                    {period.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
                    {" "}·{" "}
                    {formatDate(period.startDate)} – {formatDate(period.endDate)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground ml-6">
                    {formatDate(period.startDate)} – {formatDate(period.endDate)}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(period.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
