"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookmarkPlus, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SaveAsTemplateButtonProps {
  postContent: string;
  postMediaType: string;
  postMediaUrls: string[];
}

export function SaveAsTemplateButton({
  postContent,
  postMediaType,
  postMediaUrls,
}: SaveAsTemplateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [name, setName] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Please enter a template name.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          content: postContent,
          mediaType: postMediaType,
          mediaUrls: postMediaUrls,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save template");
      }
      toast({ title: "Template saved", description: `"${name.trim()}" added to Templates.`, variant: "success" });
      setShowNameInput(false);
      setName("");
    } catch (err) {
      toast({
        title: "Failed to save template",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (showNameInput) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
            if (e.key === "Escape") { setShowNameInput(false); setName(""); }
          }}
          className="h-8 w-36 text-xs"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleSave()}
          disabled={loading || !name.trim()}
          title="Confirm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setShowNameInput(false); setName(""); }}
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowNameInput(true)}
      title="Save as template"
    >
      <BookmarkPlus className="h-4 w-4" />
    </Button>
  );
}
