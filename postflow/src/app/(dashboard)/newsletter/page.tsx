"use client";

import { useState } from "react";
import {
  Newspaper,
  RefreshCw,
  Clock,
  FileText,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { NewsletterDraft } from "@/lib/ai";

const TONE_OPTIONS = [
  "professional",
  "casual",
  "educational",
  "inspiring",
  "entertaining",
];

export default function NewsletterPage() {
  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tone, setTone] = useState("");
  const [customIntro, setCustomIntro] = useState("");
  const [loading, setLoading] = useState(false);
  const [newsletter, setNewsletter] = useState<NewsletterDraft | null>(null);
  const [postCount, setPostCount] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setNewsletter(null);
    try {
      const body: Record<string, unknown> = {
        period,
        tone: tone || undefined,
        intro: customIntro || undefined,
      };
      if (period === "custom") {
        body.from = from;
        body.to = to;
      }

      const res = await fetch("/api/ai/newsletter-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        newsletter?: NewsletterDraft;
        postCount?: number;
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate newsletter");
        return;
      }

      setNewsletter(data.newsletter!);
      setPostCount(data.postCount ?? 0);
      toast.success("Newsletter draft generated!");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function buildFullNewsletter(): string {
    if (!newsletter) return "";
    const lines: string[] = [
      `Subject: ${newsletter.subject}`,
      "",
      newsletter.intro,
      "",
    ];

    newsletter.sections.forEach((section) => {
      lines.push(`## ${section.headline}`);
      lines.push(`*${section.platform}*`);
      lines.push("");
      lines.push(section.excerpt);
      lines.push("");
      lines.push(section.content);
      lines.push("");
    });

    if (newsletter.keyTakeaways.length > 0) {
      lines.push("## Key Takeaways");
      newsletter.keyTakeaways.forEach((t) => lines.push(`• ${t}`));
      lines.push("");
    }

    lines.push(newsletter.conclusion);
    return lines.join("\n");
  }

  function handleExportText() {
    const text = buildFullNewsletter();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Newsletter Generator
            </h1>
            <p className="text-sm text-muted-foreground">
              Compile your published social posts into a newsletter draft using AI
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Options panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generation Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Period */}
              <div>
                <Label className="text-sm font-medium">Time Period</Label>
                <div className="mt-2 flex flex-col gap-2">
                  {(["week", "month", "custom"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${
                        period === p
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {p === "week"
                        ? "📅 This Week (last 7 days)"
                        : p === "month"
                          ? "📆 This Month (last 30 days)"
                          : "🗓️ Custom Range"}
                    </button>
                  ))}
                </div>
              </div>

              {period === "custom" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">From</Label>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">To</Label>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Tone */}
              <div>
                <Label className="text-sm font-medium">Tone</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTone("")}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      tone === ""
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    Auto
                  </button>
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                        tone === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom intro */}
              <div>
                <Label className="text-sm font-medium">
                  Context for Introduction
                </Label>
                <textarea
                  value={customIntro}
                  onChange={(e) => setCustomIntro(e.target.value)}
                  maxLength={500}
                  placeholder="E.g., 'We launched a new product this week' or 'Summer sale announcement'"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                  rows={3}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {customIntro.length}/500
                </p>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading || (period === "custom" && (!from || !to))}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : newsletter ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Newspaper className="mr-2 h-4 w-4" />
                    Generate Newsletter
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Newsletter preview */}
        <div className="lg:col-span-2">
          {!newsletter && !loading && (
            <div className="flex h-80 flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
              <Newspaper className="h-12 w-12 text-muted-foreground/25" />
              <p className="mt-3 text-sm text-muted-foreground">
                Configure options and click Generate to create your newsletter
              </p>
            </div>
          )}

          {loading && (
            <div className="flex h-80 flex-col items-center justify-center rounded-lg border">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">
                Compiling your posts into a newsletter…
              </p>
            </div>
          )}

          {newsletter && (
            <div className="space-y-4">
              {/* Header with actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    <FileText className="mr-1 h-3 w-3" />
                    {postCount} posts
                  </Badge>
                  <Badge variant="outline">
                    <Clock className="mr-1 h-3 w-3" />
                    ~{newsletter.estimatedReadTime} min read
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportText}
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    Export Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleCopy(buildFullNewsletter(), "full")
                    }
                  >
                    {copied === "full" ? (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {copied === "full" ? "Copied!" : "Copy All"}
                  </Button>
                </div>
              </div>

              {/* Subject */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subject Line
                    </p>
                    <button
                      onClick={() => handleCopy(newsletter.subject, "subject")}
                      className="text-xs text-primary hover:underline"
                    >
                      {copied === "subject" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 font-semibold">{newsletter.subject}</p>
                </CardContent>
              </Card>

              {/* Intro */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Introduction
                  </p>
                  <p className="text-sm text-muted-foreground">{newsletter.intro}</p>
                </CardContent>
              </Card>

              {/* Sections */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Content Sections ({newsletter.sections.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {newsletter.sections.map((section, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-input bg-muted/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-semibold text-sm">
                            {section.headline}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-1 text-xs capitalize"
                          >
                            {section.platform}
                          </Badge>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {section.excerpt}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleCopy(
                              `## ${section.headline}\n\n${section.excerpt}\n\n${section.content}`,
                              `section-${i}`
                            )
                          }
                          className="shrink-0 text-xs text-primary hover:underline"
                        >
                          {copied === `section-${i}` ? "✓" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Key Takeaways */}
              {newsletter.keyTakeaways.length > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Key Takeaways
                    </p>
                    <ul className="space-y-2">
                      {newsletter.keyTakeaways.map((takeaway, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {i + 1}
                          </span>
                          {takeaway}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Conclusion */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Conclusion
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {newsletter.conclusion}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
