"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Plus,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const RULE_TYPE_LABELS: Record<string, string> = {
  REQUIRED_HASHTAG: "Required Hashtag",
  FORBIDDEN_WORD: "Forbidden Word",
  MIN_LENGTH: "Minimum Length",
  MAX_HASHTAGS: "Max Hashtags",
  REQUIRED_CTA: "Required Call-to-Action",
  CUSTOM_REGEX: "Custom Pattern (Regex)",
};

const RULE_TYPE_HINTS: Record<string, string> = {
  REQUIRED_HASHTAG: "e.g. #brand (hashtag must appear in content)",
  FORBIDDEN_WORD: "e.g. competitor (word must NOT appear)",
  MIN_LENGTH: "e.g. 50 (minimum character count)",
  MAX_HASHTAGS: "e.g. 5 (maximum number of hashtags)",
  REQUIRED_CTA: "No value needed — checks for common CTA phrases",
  CUSTOM_REGEX: "e.g. \\bhello\\b (regex pattern content must match)",
};

interface ContentRule {
  id: string;
  name: string;
  type: string;
  value: string;
  platforms: string[];
  severity: string;
  isActive: boolean;
}

export function ContentRulesClient({
  initialRules,
}: {
  initialRules: ContentRule[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "REQUIRED_HASHTAG",
    value: "",
    severity: "WARNING",
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/content-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, platforms: [] }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create rule");
        return;
      }
      const data = (await res.json()) as { rule: ContentRule };
      setRules((prev) => [...prev, data.rule]);
      setForm({
        name: "",
        type: "REQUIRED_HASHTAG",
        value: "",
        severity: "WARNING",
        isActive: true,
      });
      setShowForm(false);
      toast.success("Rule created");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/content-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isActive } : r))
      );
    } else {
      toast.error("Failed to update rule");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/content-rules/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule deleted");
    } else {
      toast.error("Failed to delete rule");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="rounded-lg border p-4 space-y-4 bg-card"
        >
          <h2 className="font-semibold">New Content Rule</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Rule Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Must include brand hashtag"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.type !== "REQUIRED_CTA" && (
            <div className="space-y-1">
              <Label>Value</Label>
              <Input
                value={form.value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, value: e.target.value }))
                }
                placeholder={RULE_TYPE_HINTS[form.type]}
              />
              <p className="text-xs text-muted-foreground">
                {RULE_TYPE_HINTS[form.type]}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WARNING">Warning (advisory)</SelectItem>
                  <SelectItem value="ERROR">Error (blocking)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create Rule"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {rules.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium">No content rules yet</p>
          <p className="text-sm">
            Add rules to enforce posting standards across your content.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-lg border p-3 flex items-center gap-3 ${
              !rule.isActive ? "opacity-50" : ""
            }`}
          >
            <div className="shrink-0">
              {rule.severity === "ERROR" ? (
                <AlertCircle className="h-4 w-4 text-red-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{rule.name}</span>
                <Badge variant="outline" className="text-xs">
                  {RULE_TYPE_LABELS[rule.type] ?? rule.type}
                </Badge>
                <Badge
                  variant={
                    rule.severity === "ERROR" ? "destructive" : "secondary"
                  }
                  className="text-xs"
                >
                  {rule.severity}
                </Badge>
              </div>
              {rule.type !== "REQUIRED_CTA" && rule.value && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  Value: {rule.value}
                </p>
              )}
            </div>
            <Switch
              checked={rule.isActive}
              onCheckedChange={(v) => void handleToggle(rule.id, v)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleDelete(rule.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
