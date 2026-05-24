"use client";

import { useState, useEffect, useCallback } from "react";
import { Camera, Trash2, ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SnapshotMetrics {
  posts: { total: number; published: number; failed: number; scheduled: number; draft: number };
  publishResults: { total: number; published: number; overallSuccessRate: number };
  platformBreakdown: Array<{ platform: string; published: number; failed: number; total: number }>;
  connectedAccounts: number;
  takenAt: string;
}

interface Snapshot {
  id: string;
  name: string;
  data: SnapshotMetrics;
  createdAt: string;
}

interface Delta {
  from: number;
  to: number;
  change: number;
  changePct: number | null;
}

interface Comparison {
  from: { id: string; name: string; createdAt: string };
  to: { id: string; name: string; createdAt: string };
  deltas: {
    totalPosts: Delta;
    publishedPosts: Delta;
    failedPosts: Delta;
    scheduledPosts: Delta;
    draftPosts: Delta;
    overallSuccessRate: Delta;
    connectedAccounts: Delta;
  };
}

function DeltaBadge({ delta }: { delta: Delta }) {
  const isPositive = delta.change > 0;
  const isNeutral = delta.change === 0;
  return (
    <span
      className={`ml-2 text-xs font-medium ${
        isNeutral
          ? "text-muted-foreground"
          : isPositive
          ? "text-green-600 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {isNeutral ? "—" : isPositive ? `+${delta.change}` : delta.change}
      {delta.changePct !== null && (
        <span className="text-muted-foreground ml-1">
          ({isPositive ? "+" : ""}
          {delta.changePct}%)
        </span>
      )}
    </span>
  );
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/snapshots");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as { snapshots: Snapshot[] };
      setSnapshots(json.snapshots);
    } catch {
      toast.error("Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshots();
  }, [fetchSnapshots]);

  const createSnapshot = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/analytics/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      toast.success(`Snapshot "${newName.trim()}" saved.`);
      setNewName("");
      setShowCreateForm(false);
      await fetchSnapshots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create snapshot");
    } finally {
      setCreating(false);
    }
  };

  const deleteSnapshot = async (id: string, name: string) => {
    if (!confirm(`Delete snapshot "${name}"?`)) return;
    try {
      const res = await fetch(`/api/analytics/snapshots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      if (selectedA === id) setSelectedA(null);
      if (selectedB === id) setSelectedB(null);
      setComparison(null);
      toast.success("Snapshot deleted");
    } catch {
      toast.error("Failed to delete snapshot");
    }
  };

  const compareSnapshots = async () => {
    if (!selectedA || !selectedB) return;
    setComparing(true);
    try {
      const res = await fetch(
        `/api/analytics/snapshots/compare?from=${selectedA}&to=${selectedB}`
      );
      if (!res.ok) throw new Error("Failed to compare");
      const json = (await res.json()) as { comparison: Comparison };
      setComparison(json.comparison);
    } catch {
      toast.error("Failed to compare snapshots");
    } finally {
      setComparing(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const selectForCompare = (id: string) => {
    if (selectedA === id) {
      setSelectedA(null);
      return;
    }
    if (selectedB === id) {
      setSelectedB(null);
      return;
    }
    if (!selectedA) {
      setSelectedA(id);
      return;
    }
    if (!selectedB) {
      setSelectedB(id);
      return;
    }
    setSelectedA(id);
    setSelectedB(null);
    setComparison(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics Snapshots</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Capture point-in-time performance metrics and compare them over time.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)}>
          <Camera className="h-4 w-4 mr-2" /> Take Snapshot
        </Button>
      </div>

      {showCreateForm && (
        <div className="border rounded-lg p-4 mb-6 bg-card flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1">Snapshot name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. End of Q2 2026"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createSnapshot();
              }}
            />
          </div>
          <Button onClick={createSnapshot} disabled={creating || !newName.trim()}>
            {creating ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={() => setShowCreateForm(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {selectedA && selectedB && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Comparing{" "}
            <strong>{snapshots.find((s) => s.id === selectedA)?.name}</strong> →{" "}
            <strong>{snapshots.find((s) => s.id === selectedB)?.name}</strong>
          </span>
          <Button
            size="sm"
            onClick={compareSnapshots}
            disabled={comparing}
            className="ml-auto"
          >
            {comparing ? "Comparing…" : "Compare"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedA(null);
              setSelectedB(null);
              setComparison(null);
            }}
          >
            Clear
          </Button>
        </div>
      )}
      {selectedA && !selectedB && (
        <p className="text-sm text-muted-foreground mb-4">
          Select a second snapshot to compare.
        </p>
      )}

      {comparison && (
        <div className="border rounded-lg p-5 mb-6 bg-card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            {comparison.from.name} → {comparison.to.name}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                { label: "Total Posts", key: "totalPosts" as const },
                { label: "Published", key: "publishedPosts" as const },
                { label: "Failed", key: "failedPosts" as const },
                { label: "Scheduled", key: "scheduledPosts" as const },
                { label: "Drafts", key: "draftPosts" as const },
                { label: "Success Rate %", key: "overallSuccessRate" as const },
                { label: "Accounts", key: "connectedAccounts" as const },
              ] as const
            ).map(({ label, key }) => (
              <div key={key} className="bg-muted/40 rounded p-3">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="text-lg font-bold">{comparison.deltas[key].to}</div>
                <DeltaBadge delta={comparison.deltas[key]} />
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No snapshots yet</p>
          <p className="text-sm mt-1">Take your first snapshot to start tracking progress.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select two snapshots to compare them side-by-side.
          </p>
          {snapshots.map((snap) => {
            const isSelectedA = selectedA === snap.id;
            const isSelectedB = selectedB === snap.id;
            const isSelected = isSelectedA || isSelectedB;
            return (
              <div
                key={snap.id}
                className={`border rounded-lg p-4 bg-card cursor-pointer transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/30"
                    : "hover:bg-muted/30"
                }`}
                onClick={() => selectForCompare(snap.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{snap.name}</span>
                      {isSelectedA && (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">
                          A
                        </span>
                      )}
                      {isSelectedB && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded">
                          B
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(snap.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{snap.data.posts.total} posts</span>
                    <span>{snap.data.posts.published} published</span>
                    <span>{snap.data.publishResults.overallSuccessRate}% success</span>
                    <span>{snap.data.connectedAccounts} accounts</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteSnapshot(snap.id, snap.name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
