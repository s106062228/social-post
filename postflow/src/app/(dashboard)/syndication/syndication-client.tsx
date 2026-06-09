"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Share2,
  Plus,
  Trash2,
  ArrowRight,
  Clock,
  Check,
  X,
  FlaskConical,
} from "lucide-react";

const ALL_PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "THREADS",
  "LINKEDIN",
  "PINTEREST",
  "YOUTUBE",
  "TIKTOK",
  "TWITTER",
  "BLUESKY",
  "MASTODON",
  "TELEGRAM",
  "REDDIT",
  "NOSTR",
  "TUMBLR",
  "WORDPRESS",
  "MEDIUM",
  "GHOST",
  "DEVTO",
  "GOOGLE_BUSINESS",
  "HASHNODE",
  "BEEHIIV",
  "PIXELFED",
  "VIMEO",
] as const;

type Platform = (typeof ALL_PLATFORMS)[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
};

const DELAY_OPTIONS = [
  { label: "Immediately", value: 0 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
];

interface SyndicationTransformations {
  truncate?: boolean;
  stripLinks?: boolean;
  appendHashtags?: string;
  customSuffix?: string;
}

interface SyndicationRule {
  id: string;
  name: string;
  sourcePlatform: Platform;
  targetPlatforms: Platform[];
  transformations: SyndicationTransformations;
  delayMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  original: string;
  adapted: { platform: Platform; content: string }[];
}

const DEFAULT_TRANSFORMATIONS: SyndicationTransformations = {
  truncate: true,
  stripLinks: false,
  appendHashtags: "",
  customSuffix: "",
};

export function SyndicationClient() {
  const [rules, setRules] = useState<SyndicationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState<Platform>("FACEBOOK");
  const [newTargets, setNewTargets] = useState<Platform[]>([]);
  const [newDelay, setNewDelay] = useState(0);
  const [newTransformations, setNewTransformations] =
    useState<SyndicationTransformations>(DEFAULT_TRANSFORMATIONS);

  // Test preview state
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [testContent, setTestContent] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testPending, setTestPending] = useState(false);

  async function fetchRules() {
    setLoading(true);
    try {
      const res = await fetch("/api/syndication-rules");
      if (!res.ok) throw new Error("Failed to load syndication rules");
      const data = (await res.json()) as { rules: SyndicationRule[] };
      setRules(data.rules);
    } catch {
      toast({ title: "Failed to load syndication rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRules();
  }, []);

  function toggleTarget(platform: Platform) {
    setNewTargets((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  function createRule() {
    if (!newName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (newTargets.length === 0) {
      toast({ title: "Select at least one target platform", variant: "destructive" });
      return;
    }
    if (newTargets.includes(newSource)) {
      toast({
        title: "Source platform cannot be a target platform",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/syndication-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim(),
            sourcePlatform: newSource,
            targetPlatforms: newTargets,
            transformations: {
              truncate: newTransformations.truncate,
              stripLinks: newTransformations.stripLinks,
              appendHashtags: newTransformations.appendHashtags || undefined,
              customSuffix: newTransformations.customSuffix || undefined,
            },
            delayMinutes: newDelay,
            isActive: true,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(
            typeof data.error === "string" ? data.error : "Create failed"
          );
        }
        toast({ title: "Syndication rule created", variant: "success" });
        setCreating(false);
        setNewName("");
        setNewSource("FACEBOOK");
        setNewTargets([]);
        setNewDelay(0);
        setNewTransformations(DEFAULT_TRANSFORMATIONS);
        await fetchRules();
      } catch (err) {
        toast({
          title: "Failed to create syndication rule",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function toggleActive(rule: SyndicationRule) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/syndication-rules/${rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !rule.isActive }),
        });
        if (!res.ok) throw new Error("Update failed");
        await fetchRules();
      } catch {
        toast({ title: "Failed to update rule", variant: "destructive" });
      }
    });
  }

  function deleteRule(rule: SyndicationRule) {
    if (!confirm(`Delete syndication rule "${rule.name}"?`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/syndication-rules/${rule.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        toast({ title: "Syndication rule deleted", variant: "success" });
        await fetchRules();
      } catch {
        toast({ title: "Failed to delete rule", variant: "destructive" });
      }
    });
  }

  async function testRule(ruleId: string) {
    if (!testContent.trim()) {
      toast({ title: "Enter some content to test", variant: "destructive" });
      return;
    }
    setTestPending(true);
    try {
      const res = await fetch(`/api/syndication-rules/${ruleId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: testContent }),
      });
      if (!res.ok) throw new Error("Test failed");
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch {
      toast({ title: "Failed to test rule", variant: "destructive" });
    } finally {
      setTestPending(false);
    }
  }

  function openTest(ruleId: string) {
    setTestingRuleId(ruleId);
    setTestContent("");
    setTestResult(null);
  }

  function closeTest() {
    setTestingRuleId(null);
    setTestContent("");
    setTestResult(null);
  }

  const availableTargets = ALL_PLATFORMS.filter((p) => p !== newSource);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="h-6 w-6" />
            Content Syndication
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically cross-post content to other platforms after it publishes
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Rule
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">New Syndication Rule</h2>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Rule name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Facebook → Twitter"
              maxLength={100}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Source platform *
              </label>
              <select
                value={newSource}
                onChange={(e) => {
                  setNewSource(e.target.value as Platform);
                  setNewTargets((prev: Platform[]) =>
                    prev.filter((p: Platform) => p !== e.target.value)
                  );
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ALL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Delay before creating
              </label>
              <select
                value={newDelay}
                onChange={(e) => setNewDelay(Number(e.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {DELAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Target platforms *
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTargets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleTarget(p)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    newTargets.includes(p)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:border-muted-foreground"
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block font-medium">
              Transformations
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newTransformations.truncate !== false}
                  onChange={(e) =>
                    setNewTransformations((prev) => ({
                      ...prev,
                      truncate: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Truncate to platform character limit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newTransformations.stripLinks === true}
                  onChange={(e) =>
                    setNewTransformations((prev) => ({
                      ...prev,
                      stripLinks: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Strip links from content
              </label>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Append hashtags (comma or space separated)
                </label>
                <input
                  type="text"
                  value={newTransformations.appendHashtags ?? ""}
                  onChange={(e) =>
                    setNewTransformations((prev) => ({
                      ...prev,
                      appendHashtags: e.target.value,
                    }))
                  }
                  placeholder="#crosspost #syndicated"
                  maxLength={500}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Custom suffix (appended to all syndicated posts)
                </label>
                <input
                  type="text"
                  value={newTransformations.customSuffix ?? ""}
                  onChange={(e) =>
                    setNewTransformations((prev) => ({
                      ...prev,
                      customSuffix: e.target.value,
                    }))
                  }
                  placeholder="Originally posted on Facebook"
                  maxLength={500}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createRule} disabled={isPending}>
              <Check className="mr-1 h-3 w-3" />
              Create Rule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setNewSource("FACEBOOK");
                setNewTargets([]);
                setNewDelay(0);
                setNewTransformations(DEFAULT_TRANSFORMATIONS);
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Test preview modal */}
      {testingRuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border bg-card p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Test Transformation Preview</h2>
              <Button size="icon" variant="ghost" onClick={closeTest}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Sample content
              </label>
              <textarea
                value={testContent}
                onChange={(e) => {
                  setTestContent(e.target.value);
                  setTestResult(null);
                }}
                rows={4}
                placeholder="Enter some post content to preview the transformation..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <Button
              size="sm"
              onClick={() => void testRule(testingRuleId)}
              disabled={testPending}
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              {testPending ? "Testing…" : "Preview"}
            </Button>
            {testResult && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Original ({testResult.original.length} chars)
                  </p>
                  <p className="text-sm rounded bg-muted px-3 py-2">
                    {testResult.original}
                  </p>
                </div>
                {testResult.adapted.map(({ platform, content }) => (
                  <div key={platform}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {PLATFORM_LABELS[platform]} ({content.length} chars)
                    </p>
                    <p className="text-sm rounded bg-muted px-3 py-2">{content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Share2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No syndication rules yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a rule to automatically cross-post content after it publishes
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{rule.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rule.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground flex-wrap">
                    <span className="font-medium text-foreground">
                      {PLATFORM_LABELS[rule.sourcePlatform]}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span>
                      {rule.targetPlatforms
                        .map((p) => PLATFORM_LABELS[p])
                        .join(", ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {rule.delayMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {DELAY_OPTIONS.find(
                          (o) => o.value === rule.delayMinutes
                        )?.label ?? `${rule.delayMinutes}m delay`}
                      </span>
                    )}
                    {rule.transformations.truncate !== false && (
                      <span>Truncate</span>
                    )}
                    {rule.transformations.stripLinks && (
                      <span>Strip links</span>
                    )}
                    {rule.transformations.appendHashtags && (
                      <span>+Hashtags</span>
                    )}
                    {rule.transformations.customSuffix && (
                      <span>+Suffix</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => openTest(rule.id)}
                  >
                    <FlaskConical className="mr-1 h-3 w-3" />
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => toggleActive(rule)}
                    disabled={isPending}
                  >
                    {rule.isActive ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteRule(rule)}
                    title="Delete"
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
