"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  Globe,
  User,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type EventType = "HOLIDAY" | "OBSERVANCE" | "AWARENESS_DAY" | "CUSTOM";

interface SocialEvent {
  id: string;
  userId: string | null;
  title: string;
  description: string | null;
  date: string;
  type: EventType;
  platforms: string[];
  categories: string[];
  isGlobal: boolean;
  createdAt: string;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HOLIDAY: "Holiday",
  OBSERVANCE: "Observance",
  AWARENESS_DAY: "Awareness Day",
  CUSTOM: "Custom",
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  HOLIDAY: "bg-red-100 text-red-800",
  OBSERVANCE: "bg-blue-100 text-blue-800",
  AWARENESS_DAY: "bg-purple-100 text-purple-800",
  CUSTOM: "bg-green-100 text-green-800",
};

const TYPE_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Holidays", value: "HOLIDAY" },
  { label: "Observances", value: "OBSERVANCE" },
  { label: "Awareness Days", value: "AWARENESS_DAY" },
  { label: "Custom", value: "CUSTOM" },
];

function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getMonthLabel(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface AiSuggestDialogProps {
  event: SocialEvent;
  onClose: () => void;
}

function AiSuggestDialog({ event, onClose }: AiSuggestDialogProps) {
  const [variants, setVariants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/event-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: event.title,
          description: event.description,
          platforms:
            event.platforms.length > 0
              ? event.platforms
              : ["FACEBOOK", "INSTAGRAM", "TWITTER"],
        }),
      });
      const data = (await res.json()) as { variants?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to generate content");
      } else {
        setVariants(data.variants ?? []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">AI Content Suggestions</h2>
            <p className="text-sm text-muted-foreground">{event.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                Generating suggestions…
              </span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void fetchVariants()}
              >
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {variants.map((variant, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      Variant {idx + 1}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(variant)}
                      >
                        Copy
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/posts/new?content=${encodeURIComponent(variant)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Use
                        </a>
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{variant}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {variant.length} characters
                  </p>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void fetchVariants()}
              >
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SocialEventsPage() {
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [aiEvent, setAiEvent] = useState<SocialEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState<EventType>("CUSTOM");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch next 90 days: build month queries for current and next 2 months
      const now = new Date();
      const months: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        months.push(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        );
      }

      const allEvents = new Map<string, SocialEvent>();
      await Promise.all(
        months.map(async (month) => {
          const params = new URLSearchParams({ month });
          if (typeFilter) params.set("type", typeFilter);
          const res = await fetch(`/api/social-events?${params.toString()}`);
          if (res.ok) {
            const data = (await res.json()) as { events: SocialEvent[] };
            for (const ev of data.events) {
              allEvents.set(ev.id, ev);
            }
          }
        })
      );

      // Filter to next 90 days
      const today = now.toISOString().slice(0, 10);
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + 90);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const sorted = Array.from(allEvents.values())
        .filter((e) => e.date >= today && e.date <= futureDateStr)
        .sort((a, b) => a.date.localeCompare(b.date));

      setEvents(sorted);
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setCreating(true);
    try {
      const res = await fetch("/api/social-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), date, type: eventType, description: description.trim() || undefined }),
      });
      if (res.ok) {
        toast.success("Event created");
        setTitle("");
        setDate("");
        setDescription("");
        setEventType("CUSTOM");
        setShowCreateForm(false);
        void fetchEvents();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create event");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (event: SocialEvent) => {
    if (event.isGlobal) {
      toast.error("Cannot delete global events");
      return;
    }
    setDeletingId(event.id);
    try {
      const res = await fetch(`/api/social-events/${event.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        toast.success("Event deleted");
        void fetchEvents();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to delete event");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingId(null);
    }
  };

  // Group events by month
  const grouped = new Map<string, SocialEvent[]>();
  for (const event of events) {
    const monthKey = event.date.slice(0, 7);
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);
    grouped.get(monthKey)!.push(event);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Social Events Calendar</h1>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Custom Event
        </Button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map(({ label, value }) => (
          <Button
            key={value}
            variant={typeFilter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Custom Event</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Title *
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Event title"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Date *
                  </label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="CUSTOM">Custom</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="OBSERVANCE">Observance</option>
                  <option value="AWARENESS_DAY">Awareness Day</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Description (optional)
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the event"
                  rows={2}
                  maxLength={500}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Event
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Events timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading events…</span>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No events found for the next 90 days.</p>
          {typeFilter && (
            <Button
              variant="link"
              onClick={() => setTypeFilter("")}
              className="mt-2"
            >
              Clear filter
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([monthKey, monthEvents]) => (
            <div key={monthKey}>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground border-b pb-2">
                {getMonthLabel(monthKey + "-01")}
              </h2>
              <div className="space-y-2">
                {monthEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {event.isGlobal ? (
                        <Globe className="h-4 w-4 text-blue-500" title="Global event" />
                      ) : (
                        <User className="h-4 w-4 text-green-600" title="Custom event" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{event.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateDisplay(event.date)}
                          </p>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {event.description}
                            </p>
                          )}
                        </div>
                        <Badge
                          className={`text-xs shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}
                        >
                          {EVENT_TYPE_LABELS[event.type]}
                        </Badge>
                      </div>

                      {event.platforms.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {event.platforms.map((p) => (
                            <span
                              key={p}
                              className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAiEvent(event)}
                        title="AI content suggestions"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI Suggest
                      </Button>
                      {!event.isGlobal && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDelete(event)}
                          disabled={deletingId === event.id}
                          title="Delete event"
                        >
                          {deletingId === event.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Suggest dialog */}
      {aiEvent && (
        <AiSuggestDialog
          event={aiEvent}
          onClose={() => setAiEvent(null)}
        />
      )}
    </div>
  );
}
