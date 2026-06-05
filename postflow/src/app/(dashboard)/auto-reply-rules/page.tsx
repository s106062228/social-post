"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Trash2, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
}

interface AutoReplyRule {
  id: string;
  name: string;
  triggerKeywords: string[];
  templateId: string;
  template: ResponseTemplate;
  platform: string | null;
  isActive: boolean;
  matchCount: number;
  createdAt: string;
}

export default function AutoReplyRulesPage() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rulesRes, templatesRes] = await Promise.all([
        fetch("/api/auto-reply-rules"),
        fetch("/api/response-templates"),
      ]);
      const rulesData = (await rulesRes.json()) as { rules?: AutoReplyRule[] };
      const templatesData = (await templatesRes.json()) as { templates?: ResponseTemplate[] };
      setRules(rulesData.rules ?? []);
      setTemplates(templatesData.templates ?? []);
    } catch {
      toast.error("Failed to load auto-reply rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || !newTemplateId || !newKeywords.trim()) return;
    const keywords = newKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      toast.error("Add at least one trigger keyword");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auto-reply-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          triggerKeywords: keywords,
          templateId: newTemplateId,
          platform: newPlatform || undefined,
        }),
      });
      const data = (await res.json()) as { rule?: AutoReplyRule; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule");
      if (data.rule) setRules((prev) => [...prev, data.rule!]);
      setNewName("");
      setNewKeywords("");
      setNewTemplateId("");
      setNewPlatform("");
      setCreating(false);
      toast.success("Auto-reply rule created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: AutoReplyRule) {
    setTogglingId(rule.id);
    try {
      const res = await fetch(`/api/auto-reply-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = (await res.json()) as { rule?: AutoReplyRule; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update rule");
      if (data.rule) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule! : r)));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rule");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/auto-reply-rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete rule");
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Auto-Reply Rules</h1>
            <p className="text-sm text-muted-foreground">
              Automatically reply to comments containing specific keywords
            </p>
          </div>
        </div>
        {!creating && templates.length > 0 && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Rule
          </Button>
        )}
      </div>

      {templates.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Zap className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No response templates found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create response templates first before setting up auto-reply rules.
            </p>
            <Button variant="outline" className="mt-3" asChild>
              <a href="/response-templates">Go to Response Templates</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {creating && templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Auto-Reply Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-name">Rule Name *</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Thank you for support"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-platform">Platform (optional)</Label>
                <select
                  id="new-platform"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                >
                  <option value="">All platforms</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="TWITTER">Twitter / X</option>
                  <option value="LINKEDIN">LinkedIn</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-keywords">
                Trigger Keywords * <span className="font-normal text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input
                id="new-keywords"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="e.g. thank you, thanks, great post"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Rule fires when a comment contains any of these keywords (case-insensitive).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-template">Response Template *</Label>
              <select
                id="new-template"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.category ? ` (${t.category})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {newTemplateId && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium">Preview: </span>
                {templates.find((t) => t.id === newTemplateId)?.content}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewKeywords("");
                  setNewTemplateId("");
                  setNewPlatform("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim() || !newTemplateId || !newKeywords.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 && templates.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No auto-reply rules yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create rules to automatically reply to comments with matching keywords.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={rule.isActive ? "" : "opacity-60"}>
              <CardContent className="flex items-start justify-between gap-4 pt-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{rule.name}</span>
                    {rule.platform && (
                      <Badge variant="outline" className="text-xs">
                        {rule.platform}
                      </Badge>
                    )}
                    <Badge
                      variant={rule.isActive ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {rule.isActive ? "Active" : "Paused"}
                    </Badge>
                    {rule.matchCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {rule.matchCount} auto-replies sent
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rule.triggerKeywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="text-xs font-normal">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reply: </span>
                    {rule.template.name}
                    {rule.template.category && (
                      <span className="text-xs ml-1">({rule.template.category})</span>
                    )}
                    <span className="text-xs ml-2 italic">
                      &ldquo;{rule.template.content.slice(0, 80)}
                      {rule.template.content.length > 80 ? "…" : ""}&rdquo;
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => void handleToggle(rule)}
                    disabled={togglingId === rule.id}
                    title={rule.isActive ? "Pause rule" : "Activate rule"}
                  >
                    {togglingId === rule.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : rule.isActive ? (
                      <ToggleRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(rule.id)}
                    disabled={deletingId === rule.id}
                    title="Delete rule"
                  >
                    {deletingId === rule.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
