"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Zap, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────────

type TriggerType =
  | "QUEUE_EMPTY"
  | "LOW_ENGAGEMENT"
  | "EVERGREEN_DUE"
  | "POSTING_GAP"
  | "DAILY_SCHEDULE";

type ActionType =
  | "PUBLISH_EVERGREEN"
  | "RESCHEDULE_POST"
  | "SEND_NOTIFICATION"
  | "PAUSE_PUBLISHING"
  | "CREATE_FROM_TEMPLATE";

interface AutopilotRule {
  id: string;
  name: string;
  description: string | null;
  trigger: TriggerType;
  conditionJson: Record<string, unknown>;
  action: ActionType;
  actionDataJson: Record<string, unknown>;
  isActive: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

// ── Labels ─────────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  QUEUE_EMPTY: "Queue Empty",
  LOW_ENGAGEMENT: "Low Engagement",
  EVERGREEN_DUE: "Evergreen Due",
  POSTING_GAP: "Posting Gap",
  DAILY_SCHEDULE: "Daily Schedule",
};

const ACTION_LABELS: Record<ActionType, string> = {
  PUBLISH_EVERGREEN: "Publish Evergreen Post",
  RESCHEDULE_POST: "Reschedule Post",
  SEND_NOTIFICATION: "Send Notification",
  PAUSE_PUBLISHING: "Pause Publishing",
  CREATE_FROM_TEMPLATE: "Create from Template",
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  QUEUE_EMPTY: "bg-blue-100 text-blue-800",
  LOW_ENGAGEMENT: "bg-yellow-100 text-yellow-800",
  EVERGREEN_DUE: "bg-green-100 text-green-800",
  POSTING_GAP: "bg-orange-100 text-orange-800",
  DAILY_SCHEDULE: "bg-purple-100 text-purple-800",
};

const ACTION_COLORS: Record<ActionType, string> = {
  PUBLISH_EVERGREEN: "bg-emerald-100 text-emerald-800",
  RESCHEDULE_POST: "bg-cyan-100 text-cyan-800",
  SEND_NOTIFICATION: "bg-indigo-100 text-indigo-800",
  PAUSE_PUBLISHING: "bg-red-100 text-red-800",
  CREATE_FROM_TEMPLATE: "bg-violet-100 text-violet-800",
};

// ── Create Form ────────────────────────────────────────────────────────────────

function CreateRuleForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("QUEUE_EMPTY");
  const [threshold, setThreshold] = useState("3");
  const [hours, setHours] = useState("24");
  const [hour, setHour] = useState("9");
  const [action, setAction] = useState<ActionType>("SEND_NOTIFICATION");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");

  function buildConditionJson(): Record<string, unknown> {
    if (trigger === "QUEUE_EMPTY") return { threshold: Number(threshold) };
    if (trigger === "LOW_ENGAGEMENT") return { threshold: Number(threshold) };
    if (trigger === "POSTING_GAP") return { hours: Number(hours) };
    if (trigger === "DAILY_SCHEDULE") return { hour: Number(hour) };
    return {};
  }

  function buildActionDataJson(): Record<string, unknown> {
    if (action === "SEND_NOTIFICATION") {
      return { title: notifTitle || `Autopilot: ${name}`, body: notifBody || "" };
    }
    return {};
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/autopilot-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger,
          conditionJson: buildConditionJson(),
          action,
          actionDataJson: buildActionDataJson(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create rule");
      }
      toast.success("Autopilot rule created");
      setName("");
      setDescription("");
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating rule");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" /> Add Rule
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Autopilot Rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Refill queue when empty"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ap-desc">Description (optional)</Label>
            <Input
              id="ap-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this rule does"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Trigger</Label>
              <Select
                value={trigger}
                onValueChange={(v) => setTrigger(v as TriggerType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Action</Label>
              <Select
                value={action}
                onValueChange={(v) => setAction(v as ActionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Condition fields */}
          {(trigger === "QUEUE_EMPTY" || trigger === "LOW_ENGAGEMENT") && (
            <div className="grid gap-2">
              <Label>Threshold</Label>
              <Input
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={trigger === "QUEUE_EMPTY" ? "Min scheduled posts" : "Min avg engagement"}
              />
              <p className="text-xs text-muted-foreground">
                {trigger === "QUEUE_EMPTY"
                  ? "Trigger when SCHEDULED posts fall below this number"
                  : "Trigger when 7-day avg engagement falls below this"}
              </p>
            </div>
          )}
          {trigger === "POSTING_GAP" && (
            <div className="grid gap-2">
              <Label>Hours without posting</Label>
              <Input
                type="number"
                min="1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="24"
              />
            </div>
          )}
          {trigger === "DAILY_SCHEDULE" && (
            <div className="grid gap-2">
              <Label>UTC hour (0–23)</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                placeholder="9"
              />
              <p className="text-xs text-muted-foreground">Runs once per day at this UTC hour</p>
            </div>
          )}

          {/* Action config */}
          {action === "SEND_NOTIFICATION" && (
            <div className="flex flex-col gap-2">
              <div className="grid gap-2">
                <Label>Notification title (optional)</Label>
                <Input
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder={`Autopilot: ${name || "Rule name"}`}
                />
              </div>
              <div className="grid gap-2">
                <Label>Notification body (optional)</Label>
                <Input
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Your autopilot rule was triggered"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating…" : "Create Rule"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Rule Card ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onDeleted,
  onToggled,
}: {
  rule: AutopilotRule;
  onDeleted: () => void;
  onToggled: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/autopilot-rules/${rule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Rule deleted");
      onDeleted();
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/autopilot-rules/${rule.id}/toggle`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to toggle");
      toast.success(rule.isActive ? "Rule paused" : "Rule activated");
      onToggled();
    } catch {
      toast.error("Failed to toggle rule");
    } finally {
      setToggling(false);
    }
  }

  const lastTriggered = rule.lastTriggeredAt
    ? new Date(rule.lastTriggeredAt).toLocaleString()
    : "Never";

  return (
    <Card className={rule.isActive ? "" : "opacity-60"}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{rule.name}</span>
              <Badge
                className={`text-xs ${TRIGGER_COLORS[rule.trigger]}`}
                variant="secondary"
              >
                {TRIGGER_LABELS[rule.trigger]}
              </Badge>
              <span className="text-muted-foreground text-xs">→</span>
              <Badge
                className={`text-xs ${ACTION_COLORS[rule.action]}`}
                variant="secondary"
              >
                {ACTION_LABELS[rule.action]}
              </Badge>
              {!rule.isActive && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Paused
                </Badge>
              )}
            </div>
            {rule.description && (
              <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {rule.triggerCount} trigger{rule.triggerCount !== 1 ? "s" : ""}
              </span>
              <span>Last: {lastTriggered}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              disabled={toggling}
              title={rule.isActive ? "Pause rule" : "Activate rule"}
            >
              {rule.isActive ? (
                <PowerOff className="h-4 w-4" />
              ) : (
                <Power className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AutopilotClient() {
  const [rules, setRules] = useState<AutopilotRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/autopilot-rules");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { rules: AutopilotRule[] };
      setRules(data.rules);
    } catch {
      toast.error("Failed to load autopilot rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CreateRuleForm onCreated={fetchRules} />

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Bot className="h-10 w-10 text-muted-foreground" />
            <CardTitle className="text-base">No autopilot rules yet</CardTitle>
            <CardDescription className="text-center max-w-sm">
              Autopilot rules run hourly and automatically take action based on
              triggers like an empty queue, low engagement, or posting gaps.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onDeleted={fetchRules}
              onToggled={fetchRules}
            />
          ))}
        </div>
      )}
    </div>
  );
}
