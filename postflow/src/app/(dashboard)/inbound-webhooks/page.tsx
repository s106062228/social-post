"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Plus,
  Webhook,
  Copy,
  Eye,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface InboundWebhook {
  id: string;
  name: string;
  fieldMapping: {
    contentField?: string;
    scheduledAtField?: string;
    mediaUrlsField?: string;
    titleField?: string;
  };
  defaultPlatforms: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
  secret?: string; // Only on creation
}

interface TriggerLog {
  id: string;
  success: boolean;
  statusCode: number;
  requestBody: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

const defaultForm = {
  name: "",
  fieldMapping: {
    contentField: "content",
    scheduledAtField: "scheduledAt",
    mediaUrlsField: "mediaUrls",
    titleField: "title",
  },
  defaultPlatforms: [] as string[],
  isActive: true,
};

const SAMPLE_PAYLOAD = `{
  "content": "Hello from my automation!",
  "title": "Optional title",
  "scheduledAt": "2026-01-15T14:00:00Z",
  "mediaUrls": ["https://example.com/image.jpg"]
}`;

export default function InboundWebhooksPage() {
  const [webhooks, setWebhooks] = useState<InboundWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, TriggerLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/inbound-webhooks");
      if (res.ok) {
        const data = (await res.json()) as { webhooks: InboundWebhook[] };
        setWebhooks(data.webhooks);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  function cancelForm() {
    setShowForm(false);
    setForm({ ...defaultForm });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/inbound-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create webhook");
        return;
      }

      const data = (await res.json()) as { webhook: InboundWebhook };
      const { secret, ...rest } = data.webhook;
      setWebhooks((prev) => [...prev, rest]);
      if (secret) {
        setNewSecret({ id: data.webhook.id, secret });
      }
      toast.success("Inbound webhook created");
      cancelForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/inbound-webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isActive } : w))
      );
    } else {
      toast.error("Failed to update webhook");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this inbound webhook? All trigger logs will also be deleted.")) return;
    const res = await fetch(`/api/inbound-webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      if (newSecret?.id === id) setNewSecret(null);
      toast.success("Webhook deleted");
    } else {
      toast.error("Failed to delete webhook");
    }
  }

  async function loadLogs(id: string) {
    if (expandedLogs === id) {
      setExpandedLogs(null);
      return;
    }
    setExpandedLogs(id);
    if (logs[id]) return; // Already loaded
    setLoadingLogs(id);
    try {
      const res = await fetch(`/api/inbound-webhooks/${id}/logs`);
      if (res.ok) {
        const data = (await res.json()) as { logs: TriggerLog[] };
        setLogs((prev) => ({ ...prev, [id]: data.logs }));
      }
    } finally {
      setLoadingLogs(null);
    }
  }

  async function refreshLogs(id: string) {
    setLoadingLogs(id);
    try {
      const res = await fetch(`/api/inbound-webhooks/${id}/logs`);
      if (res.ok) {
        const data = (await res.json()) as { logs: TriggerLog[] };
        setLogs((prev) => ({ ...prev, [id]: data.logs }));
      }
    } finally {
      setLoadingLogs(null);
    }
  }

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  }

  function getTriggerUrl(id: string): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/trigger/${id}`;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Inbound Webhook Triggers</h1>
        <p className="text-muted-foreground mt-1">
          Allow external services (Zapier, Make, n8n, etc.) to automatically
          create posts by sending authenticated HTTP requests.
        </p>
      </div>

      {newSecret && (
        <div className="mb-6 rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 p-4 space-y-2">
          <p className="font-semibold text-yellow-800 dark:text-yellow-200">
            Webhook Secret — Save this now!
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            This secret will never be shown again. Copy it and store it securely.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-yellow-100 dark:bg-yellow-900 rounded px-2 py-1 break-all">
              {newSecret.secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(newSecret.secret, "Secret")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNewSecret(null)}>
            I&apos;ve saved the secret
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            onClick={() => { setShowForm((v) => !v); }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Inbound Webhook
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-lg border p-4 space-y-4 bg-card"
          >
            <h2 className="font-semibold">New Inbound Webhook</h2>

            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Zapier Blog Publisher"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Field Mapping</Label>
              <p className="text-xs text-muted-foreground">
                Specify which JSON fields from the incoming payload to use.
                Use dot notation for nested fields (e.g. <code>data.text</code>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Content field</Label>
                  <Input
                    value={form.fieldMapping.contentField ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        fieldMapping: { ...f.fieldMapping, contentField: e.target.value },
                      }))
                    }
                    placeholder="content"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Title field (optional)</Label>
                  <Input
                    value={form.fieldMapping.titleField ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        fieldMapping: { ...f.fieldMapping, titleField: e.target.value },
                      }))
                    }
                    placeholder="title"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scheduled at field (optional)</Label>
                  <Input
                    value={form.fieldMapping.scheduledAtField ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        fieldMapping: { ...f.fieldMapping, scheduledAtField: e.target.value },
                      }))
                    }
                    placeholder="scheduledAt"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Media URLs field (optional)</Label>
                  <Input
                    value={form.fieldMapping.mediaUrlsField ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        fieldMapping: { ...f.fieldMapping, mediaUrlsField: e.target.value },
                      }))
                    }
                    placeholder="mediaUrls"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isActiveForm"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="isActiveForm">Active</Label>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Sample payload</p>
              <pre className="text-xs font-mono overflow-x-auto">{SAMPLE_PAYLOAD}</pre>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Webhook"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelForm}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!loading && webhooks.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No inbound webhooks yet</p>
            <p className="text-sm">
              Create an inbound webhook to allow external services to create posts.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="rounded-lg border bg-card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{webhook.name}</span>
                      {webhook.isActive ? (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Paused
                        </Badge>
                      )}
                      {webhook.triggerCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {webhook.triggerCount} trigger{webhook.triggerCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {webhook.lastTriggeredAt && (
                        <span className="text-xs text-muted-foreground">
                          · Last: {new Date(webhook.lastTriggeredAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Trigger URL */}
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-xs font-mono bg-muted rounded px-2 py-0.5 flex-1 truncate">
                        POST {getTriggerUrl(webhook.id)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        title="Copy trigger URL"
                        onClick={() => copyToClipboard(getTriggerUrl(webhook.id), "Trigger URL")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">
                      Header: <code>X-Webhook-Secret: &lt;your-secret&gt;</code>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View trigger logs"
                      onClick={() => void loadLogs(webhook.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={webhook.isActive}
                      onCheckedChange={(v) => void handleToggle(webhook.id, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Logs panel */}
              {expandedLogs === webhook.id && (
                <div className="border-t bg-muted/20">
                  <div className="flex items-center justify-between px-4 py-2">
                    <p className="text-sm font-medium">Trigger Logs</p>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={loadingLogs === webhook.id}
                        onClick={() => void refreshLogs(webhook.id)}
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingLogs === webhook.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedLogs(null)}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {loadingLogs === webhook.id && !logs[webhook.id] ? (
                    <div className="px-4 pb-4 text-sm text-muted-foreground">Loading logs…</div>
                  ) : (logs[webhook.id] ?? []).length === 0 ? (
                    <div className="px-4 pb-4 text-sm text-muted-foreground">No trigger logs yet.</div>
                  ) : (
                    <div className="divide-y">
                      {(logs[webhook.id] ?? []).map((log) => (
                        <div key={log.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                          {log.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          <span className={`font-mono ${log.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                            {log.statusCode}
                          </span>
                          <span className="text-muted-foreground flex-1 truncate">
                            {log.errorMessage ?? "Success"}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {expandedLogs !== webhook.id && (
                <button
                  className="w-full py-1.5 text-xs text-muted-foreground hover:bg-muted/30 flex items-center justify-center gap-1 transition-colors"
                  onClick={() => void loadLogs(webhook.id)}
                >
                  <ChevronDown className="h-3 w-3" />
                  View trigger logs
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Usage instructions */}
        {webhooks.length > 0 && (
          <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
            <h3 className="font-medium text-sm">How to use</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Send a <code className="text-xs bg-muted px-1 rounded">POST</code> request to
                your trigger URL with the <code className="text-xs bg-muted px-1 rounded">X-Webhook-Secret</code> header
                set to your webhook secret.
              </p>
              <div className="space-y-1">
                <p className="font-medium text-foreground text-xs">Example cURL:</p>
                <Textarea
                  readOnly
                  className="font-mono text-xs h-24 resize-none"
                  value={`curl -X POST ${webhooks[0] ? getTriggerUrl(webhooks[0].id) : "https://your-domain/api/trigger/WEBHOOK_ID"} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: YOUR_SECRET_HERE" \\
  -d '{"content": "Hello from automation!", "scheduledAt": "2026-01-15T14:00:00Z"}'`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
