"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { NewsletterDraft } from "@/lib/ai";

interface NewsletterDraftDialogProps {
  open: boolean;
  onClose: () => void;
}

const TONE_OPTIONS = [
  "professional",
  "casual",
  "educational",
  "inspiring",
  "entertaining",
];

export function NewsletterDraftDialog({
  open,
  onClose,
}: NewsletterDraftDialogProps) {
  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tone, setTone] = useState("");
  const [customIntro, setCustomIntro] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsletter, setNewsletter] = useState<NewsletterDraft | null>(null);
  const [postCount, setPostCount] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
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
        setError(data.error ?? "Failed to generate newsletter");
        return;
      }

      setNewsletter(data.newsletter!);
      setPostCount(data.postCount ?? 0);
    } catch {
      setError("Network error. Please try again.");
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Newsletter Draft</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Period selector */}
          <div>
            <Label className="text-sm font-medium">Time Period</Label>
            <div className="mt-1 flex gap-2">
              {(["week", "month", "custom"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {p === "week"
                    ? "This Week"
                    : p === "month"
                      ? "This Month"
                      : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">From</Label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">To</Label>
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
            <Label className="text-sm font-medium">Tone (optional)</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                onClick={() => setTone("")}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  tone === ""
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-accent"
                }`}
              >
                Default
              </button>
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
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

          {/* Custom intro context */}
          <div>
            <Label className="text-sm font-medium">
              Custom Introduction Context (optional)
            </Label>
            <textarea
              value={customIntro}
              onChange={(e) => setCustomIntro(e.target.value)}
              maxLength={500}
              placeholder="Add context for the newsletter intro (e.g., 'This month we launched a new product')"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
              rows={2}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {customIntro.length}/500
            </p>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? "Generating…" : newsletter ? "Regenerate" : "Generate Newsletter"}
          </Button>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Newsletter preview */}
          {newsletter && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{postCount} posts compiled</Badge>
                  <Badge variant="outline">
                    ~{newsletter.estimatedReadTime} min read
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopy(buildFullNewsletter(), "full")
                  }
                >
                  {copied === "full" ? "Copied!" : "Copy Full Newsletter"}
                </Button>
              </div>

              {/* Subject */}
              <div>
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
                <p className="mt-1 rounded border border-input bg-background px-3 py-2 text-sm font-medium">
                  {newsletter.subject}
                </p>
              </div>

              {/* Intro */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Introduction
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {newsletter.intro}
                </p>
              </div>

              {/* Sections */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sections ({newsletter.sections.length})
                </p>
                <div className="mt-2 space-y-3">
                  {newsletter.sections.map((section, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-input bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{section.headline}</p>
                          <Badge variant="outline" className="mt-1 text-xs">
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
                          {copied === `section-${i}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Takeaways */}
              {newsletter.keyTakeaways.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Key Takeaways
                  </p>
                  <ul className="mt-2 space-y-1">
                    {newsletter.keyTakeaways.map((takeaway, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-primary/10 text-center text-xs leading-4 text-primary font-medium">
                          {i + 1}
                        </span>
                        {takeaway}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Conclusion */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conclusion
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {newsletter.conclusion}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
