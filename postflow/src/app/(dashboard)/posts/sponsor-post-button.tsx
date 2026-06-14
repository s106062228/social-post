"use client";

import { useState, useTransition } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface SponsorPostButtonProps {
  postId: string;
  initialIsSponsored: boolean;
  initialSponsorName?: string | null;
  initialDisclosureText?: string | null;
  onUpdate?: (data: { isSponsored: boolean; sponsorName: string | null; disclosureText: string | null }) => void;
}

export function SponsorPostButton({
  postId,
  initialIsSponsored,
  initialSponsorName,
  initialDisclosureText,
  onUpdate,
}: SponsorPostButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSponsored, setIsSponsored] = useState(initialIsSponsored);
  const [sponsorName, setSponsorName] = useState(initialSponsorName ?? "");
  const [disclosureText, setDisclosureText] = useState(initialDisclosureText ?? "");
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = { isSponsored };
        if (isSponsored) {
          if (sponsorName.trim()) body.sponsorName = sponsorName.trim();
          if (disclosureText.trim()) body.disclosureText = disclosureText.trim();
        }

        const res = await fetch(`/api/posts/${postId}/sponsor`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update sponsor info");
        }

        const updated = await res.json();
        onUpdate?.(updated);
        toast({ title: isSponsored ? "Post marked as sponsored" : "Sponsor info cleared" });
        setIsOpen(false);
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to update",
          variant: "destructive",
        });
      }
    });
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title={isSponsored ? "Edit sponsor info" : "Mark as sponsored"}
        className={`rounded p-1 transition-colors ${
          isSponsored
            ? "text-orange-600 hover:bg-orange-100"
            : "text-gray-400 hover:text-orange-600 hover:bg-orange-50"
        }`}
      >
        <Megaphone className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Sponsor & Disclosure Settings</h3>

        <div className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="isSponsored"
            checked={isSponsored}
            onChange={(e) => setIsSponsored(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="isSponsored" className="text-sm font-medium">
            Mark as sponsored / paid partnership
          </label>
        </div>

        {isSponsored && (
          <div className="space-y-3 border-l-2 border-orange-200 pl-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Sponsor name <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                value={sponsorName}
                onChange={(e) => setSponsorName(e.target.value)}
                maxLength={200}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Disclosure text <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                value={disclosureText}
                onChange={(e) => setDisclosureText(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. #ad — or leave blank to auto-generate from sponsor name"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {disclosureText.length}/500 · Will be appended to the post before publishing
              </p>
            </div>
            {!sponsorName.trim() && !disclosureText.trim() && (
              <p className="text-xs text-orange-600">
                Please provide a sponsor name or disclosure text.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
