"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  postContent: string;
  comment: string;
  commentAuthor: string;
}

export function ReplySuggestionsDialog({ open, onClose, postContent, comment, commentAuthor }: Props) {
  const [replies, setReplies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/reply-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postContent, comment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Failed to generate replies");
        return;
      }
      const data = await res.json() as { replies: string[] };
      setReplies(data.replies);
    } catch {
      toast.error("Failed to generate reply suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function copyReply(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopied(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  }

  function handleOpen(isOpen: boolean) {
    if (!isOpen) { onClose(); setReplies([]); }
    else if (replies.length === 0 && !loading) void generate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Reply Suggestions
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{commentAuthor}:</span> {comment}
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Generating suggestions…</span>
            </div>
          ) : replies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">No suggestions yet.</p>
              <Button size="sm" onClick={() => void generate()} disabled={loading}>
                <Sparkles className="h-3 w-3 mr-1" /> Generate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {replies.map((reply, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border p-3 bg-card">
                  <p className="flex-1 text-sm">{reply}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => void copyReply(reply, idx)}
                  >
                    {copied === idx ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => void generate()}>
                <Sparkles className="h-3 w-3 mr-1" /> Regenerate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
