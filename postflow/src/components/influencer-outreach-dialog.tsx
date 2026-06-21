"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2, RefreshCw, Mail, MessageSquare, Clock } from "lucide-react";
import { toast } from "sonner";
import type { InfluencerOutreachResult } from "@/lib/ai";

interface InfluencerProfile {
  name: string;
  handle: string;
  platform: string | null;
  followerCount: number | null;
  niche: string | null;
}

interface InfluencerOutreachDialogProps {
  influencer: InfluencerProfile;
  onClose: () => void;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
] as const;

type Tone = "professional" | "friendly" | "casual";

export function InfluencerOutreachDialog({
  influencer,
  onClose,
}: InfluencerOutreachDialogProps) {
  const [open, setOpen] = useState(true);
  const [campaignBrief, setCampaignBrief] = useState("");
  const [tone, setTone] = useState<Tone>("friendly");
  const [outreach, setOutreach] = useState<InfluencerOutreachResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setOpen(false);
      onClose();
    }
  }

  async function handleGenerate() {
    if (!campaignBrief.trim() || campaignBrief.trim().length < 10) {
      toast.error("Campaign brief must be at least 10 characters");
      return;
    }

    setLoading(true);
    setOutreach(null);
    try {
      const res = await fetch("/api/ai/influencer-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerName: influencer.name,
          handle: influencer.handle,
          platform: influencer.platform ?? undefined,
          followerCount: influencer.followerCount ?? undefined,
          niche: influencer.niche ?? undefined,
          campaignBrief: campaignBrief.trim(),
          tone,
        }),
      });

      if (res.status === 503) {
        toast.error("AI features are not configured");
        return;
      }

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Failed to generate outreach messages");
        return;
      }

      const data = await res.json() as { outreach: InfluencerOutreachResult };
      setOutreach(data.outreach);
    } catch {
      toast.error("Failed to generate outreach messages");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string, sectionKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionKey);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedSection(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Influencer Outreach</DialogTitle>
          <DialogDescription>
            Generate personalized outreach messages for{" "}
            <span className="font-medium text-foreground">
              @{influencer.handle}
            </span>
            {influencer.platform && ` on ${influencer.platform}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campaign Brief */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-brief">Campaign Brief</Label>
            <Textarea
              id="campaign-brief"
              value={campaignBrief}
              onChange={(e) => setCampaignBrief(e.target.value)}
              placeholder="Describe your campaign, what you're looking for, the product or service, collaboration type (sponsored post, review, giveaway, etc.), and any relevant details…"
              rows={4}
              maxLength={2000}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {campaignBrief.length}/2000
            </p>
          </div>

          {/* Tone Selector */}
          <div className="space-y-1.5">
            <Label>Message Tone</Label>
            <div className="flex gap-2">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTone(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    tone === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={loading || !campaignBrief.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : outreach ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </>
            ) : (
              "Generate Outreach Messages"
            )}
          </Button>

          {/* Results */}
          {outreach && (
            <div className="space-y-4 pt-2">
              {/* Email Subject */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Subject
                  </Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleCopy(outreach.subject, "subject")}
                  >
                    {copiedSection === "subject" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 text-sm font-medium">
                  {outreach.subject}
                </div>
              </div>

              {/* Email Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Body
                  </Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleCopy(outreach.emailBody, "emailBody")}
                  >
                    {copiedSection === "emailBody" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                  {outreach.emailBody}
                </div>
              </div>

              {/* DM Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    DM Message
                    <span className="text-xs text-muted-foreground font-normal">
                      ({outreach.dmMessage.length} chars)
                    </span>
                  </Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleCopy(outreach.dmMessage, "dmMessage")}
                  >
                    {copiedSection === "dmMessage" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 text-sm whitespace-pre-wrap">
                  {outreach.dmMessage}
                </div>
              </div>

              {/* Follow-up Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Follow-up Message
                  </Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleCopy(outreach.followUpMessage, "followUpMessage")}
                  >
                    {copiedSection === "followUpMessage" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="bg-muted rounded-md px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                  {outreach.followUpMessage}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
