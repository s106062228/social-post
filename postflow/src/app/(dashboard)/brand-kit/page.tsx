"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Loader2, Save, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface BrandKit {
  id: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  tagline: string | null;
  voiceGuide: string | null;
  doKeywords: string[];
  dontKeywords: string[];
}

function ColorSwatch({ color, label }: { color: string | null; label: string }) {
  if (!color) return null;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-5 w-5 rounded border border-border shadow-sm"
        style={{ backgroundColor: color }}
        title={color}
      />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono">{color}</span>
    </div>
  );
}

export default function BrandKitPage() {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [voiceGuide, setVoiceGuide] = useState("");
  const [doKeywords, setDoKeywords] = useState<string[]>([]);
  const [dontKeywords, setDontKeywords] = useState<string[]>([]);
  const [newDoKeyword, setNewDoKeyword] = useState("");
  const [newDontKeyword, setNewDontKeyword] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-kit");
      if (!res.ok) throw new Error("Failed to load brand kit");
      const data = (await res.json()) as BrandKit | null;
      if (data) {
        setBrandKit(data);
        setPrimaryColor(data.primaryColor ?? "");
        setSecondaryColor(data.secondaryColor ?? "");
        setAccentColor(data.accentColor ?? "");
        setLogoUrl(data.logoUrl ?? "");
        setTagline(data.tagline ?? "");
        setVoiceGuide(data.voiceGuide ?? "");
        setDoKeywords(data.doKeywords ?? []);
        setDontKeywords(data.dontKeywords ?? []);
      }
    } catch {
      toast.error("Failed to load brand kit");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        primaryColor: primaryColor || null,
        secondaryColor: secondaryColor || null,
        accentColor: accentColor || null,
        logoUrl: logoUrl || null,
        tagline: tagline || null,
        voiceGuide: voiceGuide || null,
        doKeywords,
        dontKeywords,
      };

      const res = await fetch("/api/brand-kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as BrandKit & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save brand kit");
      setBrandKit(data);
      toast.success("Brand kit saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save brand kit");
    } finally {
      setSaving(false);
    }
  }

  function addDoKeyword() {
    const kw = newDoKeyword.trim();
    if (!kw || doKeywords.includes(kw) || doKeywords.length >= 30) return;
    setDoKeywords((prev) => [...prev, kw]);
    setNewDoKeyword("");
  }

  function addDontKeyword() {
    const kw = newDontKeyword.trim();
    if (!kw || dontKeywords.includes(kw) || dontKeywords.length >= 30) return;
    setDontKeywords((prev) => [...prev, kw]);
    setNewDontKeyword("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Palette className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Brand Kit</h1>
            <p className="text-sm text-muted-foreground">
              Define your brand colors, voice, and content guidelines
            </p>
          </div>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Colors</CardTitle>
          <CardDescription>Hex color codes for your brand palette</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="primary-color-picker"
                  value={primaryColor || "#000000"}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  title="Pick primary color"
                />
                <Input
                  id="primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#3b82f6"
                  maxLength={7}
                  className="font-mono"
                />
              </div>
              {primaryColor && (
                <ColorSwatch color={primaryColor} label="" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Secondary Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="secondary-color-picker"
                  value={secondaryColor || "#000000"}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  title="Pick secondary color"
                />
                <Input
                  id="secondary-color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#8b5cf6"
                  maxLength={7}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="accent-color-picker"
                  value={accentColor || "#000000"}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  title="Pick accent color"
                />
                <Input
                  id="accent-color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#f59e0b"
                  maxLength={7}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          {(brandKit?.primaryColor || brandKit?.secondaryColor || brandKit?.accentColor) && (
            <div className="flex flex-wrap gap-3 pt-2 border-t">
              <ColorSwatch color={brandKit.primaryColor} label="Primary" />
              <ColorSwatch color={brandKit.secondaryColor} label="Secondary" />
              <ColorSwatch color={brandKit.accentColor} label="Accent" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              maxLength={2048}
              type="url"
            />
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Brand logo preview"
                className="h-12 w-auto object-contain rounded border border-border bg-muted p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Your brand&apos;s memorable phrase"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">{tagline.length}/200</p>
          </div>
        </CardContent>
      </Card>

      {/* Voice Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Voice Guide</CardTitle>
          <CardDescription>
            Describe your brand&apos;s tone, personality, and writing style
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={voiceGuide}
            onChange={(e) => setVoiceGuide(e.target.value)}
            placeholder="e.g. Friendly but professional. Use first-person plural ('we'). Avoid jargon. Be concise and direct. End posts with a question to encourage engagement."
            rows={5}
            maxLength={2000}
            className="resize-y"
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{voiceGuide.length}/2000</p>
        </CardContent>
      </Card>

      {/* Keywords */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-green-600">Do Use</CardTitle>
            <CardDescription>Words and phrases that fit your brand</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5 min-h-[40px]">
              {doKeywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 gap-1 cursor-default"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => setDoKeywords((prev) => prev.filter((k) => k !== kw))}
                    className="ml-0.5 hover:text-green-900"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {doKeywords.length === 0 && (
                <p className="text-sm text-muted-foreground">No keywords yet</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newDoKeyword}
                onChange={(e) => setNewDoKeyword(e.target.value)}
                placeholder="Add a keyword…"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDoKeyword();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={addDoKeyword}
                disabled={!newDoKeyword.trim() || doKeywords.length >= 30}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{doKeywords.length}/30</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-600">Don&apos;t Use</CardTitle>
            <CardDescription>Words and phrases to avoid</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5 min-h-[40px]">
              {dontKeywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 gap-1 cursor-default"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => setDontKeywords((prev) => prev.filter((k) => k !== kw))}
                    className="ml-0.5 hover:text-red-900"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {dontKeywords.length === 0 && (
                <p className="text-sm text-muted-foreground">No keywords yet</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newDontKeyword}
                onChange={(e) => setNewDontKeyword(e.target.value)}
                placeholder="Add a keyword…"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDontKeyword();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={addDontKeyword}
                disabled={!newDontKeyword.trim() || dontKeywords.length >= 30}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{dontKeywords.length}/30</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
