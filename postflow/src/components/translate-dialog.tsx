"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Languages, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  pt: "Portuguese",
  zh: "Chinese",
  ar: "Arabic",
  ko: "Korean",
  it: "Italian",
};

const DEFAULT_LANGUAGES = ["es", "fr", "de"];

interface Translation {
  language: string;
  content: string;
}

interface TranslateDialogProps {
  postId: string;
}

export function TranslateDialog({ postId }: TranslateDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(DEFAULT_LANGUAGES);
  const [customLang, setCustomLang] = useState("");
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleLang(code: string) {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code].slice(0, 5)
    );
  }

  function addCustomLang() {
    const code = customLang.trim().toLowerCase().slice(0, 5);
    if (!code || selectedLangs.includes(code)) return;
    setSelectedLangs((prev) => [...prev, code].slice(0, 5));
    setCustomLang("");
  }

  function handleTranslate() {
    if (selectedLangs.length === 0) {
      toast({ title: "Select at least one language.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetLanguages: selectedLangs }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Translation failed");
        }
        const data = (await res.json()) as { translations: Translation[] };
        setTranslations(data.translations);
      } catch (err) {
        toast({
          title: "Translation failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function handleCopy(content: string, lang: string) {
    await navigator.clipboard.writeText(content);
    setCopied(lang);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setTranslations([]);
      setSelectedLangs(DEFAULT_LANGUAGES);
      setCustomLang("");
    }
  }

  const presetLangs = Object.keys(LANGUAGE_NAMES);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Translate post content">
          <Languages className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Translate Content</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use AI to translate your post into other languages. Hashtags, mentions, and URLs are preserved.
          </p>

          {/* Language selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Target languages (up to 5)</p>
            <div className="flex flex-wrap gap-2">
              {presetLangs.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLang(code)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedLangs.includes(code)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {LANGUAGE_NAMES[code]} ({code})
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomLang();
                  }
                }}
                placeholder="Custom code (e.g. nl, sv, pl…)"
                maxLength={5}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomLang}
                disabled={!customLang.trim() || selectedLangs.length >= 5}
              >
                Add
              </Button>
            </div>
            {selectedLangs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedLangs.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ")}
              </p>
            )}
          </div>

          {translations.length === 0 ? (
            <Button
              onClick={handleTranslate}
              disabled={isPending || selectedLangs.length === 0}
              className="w-full"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Translating…
                </>
              ) : (
                <>
                  <Languages className="mr-2 h-4 w-4" />
                  Translate
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              {translations.map((t) => (
                <div key={t.language} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {LANGUAGE_NAMES[t.language] ?? t.language}{" "}
                      <span className="text-xs text-muted-foreground">({t.language})</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{t.content.length} chars</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{t.content}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(t.content, t.language)}
                  >
                    {copied === t.language ? (
                      <Check className="mr-1 h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    Copy
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTranslate}
                disabled={isPending}
                className="w-full"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
