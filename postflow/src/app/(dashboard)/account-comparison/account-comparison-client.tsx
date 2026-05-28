"use client";

import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountComparisonCard } from "@/components/account-comparison-card";
import { toast } from "@/hooks/use-toast";
import type { AccountComparisonResponse } from "@/app/api/analytics/account-comparison/route";

interface SocialAccount {
  id: string;
  accountName: string;
  platform: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-800",
  INSTAGRAM: "bg-pink-100 text-pink-800",
  THREADS: "bg-gray-100 text-gray-800",
  TWITTER: "bg-sky-100 text-sky-800",
  LINKEDIN: "bg-indigo-100 text-indigo-800",
  YOUTUBE: "bg-red-100 text-red-800",
  TIKTOK: "bg-rose-100 text-rose-800",
  REDDIT: "bg-orange-100 text-orange-800",
  PINTEREST: "bg-rose-100 text-rose-700",
  BLUESKY: "bg-blue-50 text-blue-700",
  MASTODON: "bg-purple-100 text-purple-800",
  TELEGRAM: "bg-cyan-100 text-cyan-800",
};

export function AccountComparisonClient() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [result, setResult] = useState<AccountComparisonResponse | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { accounts: SocialAccount[] }) => {
        setAccounts(data.accounts ?? []);
      })
      .catch(() =>
        toast({ title: "Failed to load accounts", variant: "destructive" })
      )
      .finally(() => setLoadingAccounts(false));
  }, []);

  function toggleAccount(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast({ title: "Maximum 4 accounts can be compared", variant: "destructive" });
        return prev;
      }
      return [...prev, id];
    });
    // Clear previous results when selection changes
    setResult(null);
  }

  async function handleCompare() {
    if (selectedIds.length < 2) {
      toast({ title: "Select at least 2 accounts to compare", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const qs = selectedIds.map((id) => `accountIds[]=${encodeURIComponent(id)}`).join("&");
      const res = await fetch(`/api/analytics/account-comparison?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Request failed");
      }
      const data: AccountComparisonResponse = await res.json();
      setResult(data);
    } catch (err) {
      toast({
        title: "Failed to compare accounts",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold">Compare Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Side-by-side performance comparison for up to 4 of your connected social accounts
          </p>
        </div>
      </div>

      {/* Account selector */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <p className="text-sm font-medium mb-3">
            Select accounts to compare{" "}
            <span className="text-muted-foreground font-normal">
              ({selectedIds.length}/4 selected)
            </span>
          </p>

          {loadingAccounts ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 w-32 rounded-full bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active accounts connected.{" "}
              <a href="/accounts" className="text-primary underline">
                Connect an account
              </a>{" "}
              to get started.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accounts.map((acc) => {
                const isSelected = selectedIds.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    onClick={() => toggleAccount(acc.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        isSelected ? "bg-primary" : "bg-muted-foreground"
                      }`}
                    />
                    <span
                      className={`inline-block rounded px-1 text-xs ${
                        PLATFORM_COLORS[acc.platform] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {acc.platform}
                    </span>
                    {acc.accountName}
                    {isSelected && (
                      <span className="ml-1 text-xs text-primary">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={handleCompare}
            disabled={selectedIds.length < 2 || loading}
          >
            {loading ? "Comparing…" : "Compare"}
          </Button>
          {selectedIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedIds([]);
                setResult(null);
              }}
            >
              Clear selection
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Comparison Results</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                Last 30 days
              </Badge>
              <span>
                as of{" "}
                {new Date(result.comparedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <AccountComparisonCard accounts={result.accounts} />

          <p className="text-xs text-muted-foreground">
            ★ = best value in the category. Engagement Rate = (likes + comments + shares) ÷ reach × 100.
            Follower Growth requires Audience Sync data.
          </p>
        </div>
      )}
    </div>
  );
}
