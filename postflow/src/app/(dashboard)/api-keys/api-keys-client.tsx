"use client";

import { useState } from "react";
import { Trash2, Plus, Copy, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}

interface Props {
  initialKeys: ApiKey[];
}

export function ApiKeysClient({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({ title: data.error ?? "Failed to create API key", variant: "destructive" });
        return;
      }

      const created = (await res.json()) as ApiKey & { key: string };
      const { key, ...keyMeta } = created;

      setKeys((prev) => [keyMeta, ...prev]);
      setNewKey(key);
      setRevealed(false);
      setName("");
      await navigator.clipboard.writeText(key).catch(() => null);
      toast({ title: "API key created and copied to clipboard" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Revoke this API key? All requests using it will stop working.")) return;

    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast({ title: "Failed to revoke key", variant: "destructive" });
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
    if (newKey) setNewKey(null);
    toast({ title: "API key revoked" });
  }

  async function handleCopy(value: string, id: string) {
    await navigator.clipboard.writeText(value).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function isExpired(key: ApiKey) {
    return key.expiresAt != null && new Date(key.expiresAt) < new Date();
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-medium">Create new API key</p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. CI/CD pipeline"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleCreate();
            }}
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={adding} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {adding ? "Creating…" : "Create"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Maximum 10 keys per account. The full key is shown once at creation time — store it
          securely.
        </p>
      </div>

      {/* Newly created key banner */}
      {newKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            Copy your new API key — it will not be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-amber-200 px-3 py-1.5 text-sm font-mono break-all">
              {revealed ? newKey : `${"•".repeat(20)}${newKey.slice(-4)}`}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRevealed((r) => !r)}
              title={revealed ? "Hide key" : "Show key"}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(newKey, "new")}
              title="Copy to clipboard"
            >
              {copiedId === "new" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Keys list */}
      {keys.length > 0 && (
        <div className="divide-y">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{key.name}</span>
                  {isExpired(key) && (
                    <Badge variant="destructive" className="text-xs">Expired</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {key.prefix}
                  {"•".repeat(12)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt
                    ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                    : " · Never used"}
                  {key.expiresAt
                    ? ` · Expires ${new Date(key.expiresAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(key.prefix, key.id)}
                  title="Copy key prefix"
                >
                  {copiedId === key.id ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(key.id)}
                  title="Revoke key"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
