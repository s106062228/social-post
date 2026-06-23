"use client";

import { useState, useEffect, useCallback } from "react";
import { PaintBucket, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface WhitelabelConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  emailSignature: string | null;
  faviconUrl: string | null;
}

const DEFAULT_CONFIG: WhitelabelConfig = {
  appName: "PostFlow",
  logoUrl: null,
  primaryColor: "#6366f1",
  accentColor: "#8b5cf6",
  emailSignature: null,
  faviconUrl: null,
};

function ColorPreview({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-6 w-6 rounded border border-border shadow-sm flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm text-muted-foreground">{label}:</span>
      <span className="text-sm font-mono">{color}</span>
    </div>
  );
}

export default function WhitelabelPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [appName, setAppName] = useState("PostFlow");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [emailSignature, setEmailSignature] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whitelabel");
      if (!res.ok) throw new Error("Failed to load white-label config");
      const data = (await res.json()) as WhitelabelConfig;
      setAppName(data.appName ?? DEFAULT_CONFIG.appName);
      setLogoUrl(data.logoUrl ?? "");
      setPrimaryColor(data.primaryColor ?? DEFAULT_CONFIG.primaryColor);
      setAccentColor(data.accentColor ?? DEFAULT_CONFIG.accentColor);
      setEmailSignature(data.emailSignature ?? "");
      setFaviconUrl(data.faviconUrl ?? "");
    } catch {
      toast.error("Failed to load white-label config");
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
      const res = await fetch("/api/whitelabel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: appName || undefined,
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          accentColor: accentColor || null,
          emailSignature: emailSignature || null,
          faviconUrl: faviconUrl || null,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Save failed");
      }

      toast.success("White-label config saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PaintBucket className="h-6 w-6" />
            White Label
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize the branding of your PostFlow dashboard.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? (
            <><EyeOff className="h-4 w-4 mr-2" />Hide Preview</>
          ) : (
            <><Eye className="h-4 w-4 mr-2" />Show Preview</>
          )}
        </Button>
      </div>

      {showPreview && (
        <Card className="border-2 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
              Sidebar Header Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex h-16 items-center gap-3 rounded-lg px-6 border"
              style={{ background: primaryColor + "15" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
              ) : (
                <div
                  className="h-8 w-8 rounded"
                  style={{ backgroundColor: primaryColor }}
                />
              )}
              <span
                className="text-xl font-bold tracking-tight"
                style={{ color: primaryColor }}
              >
                {appName || "PostFlow"}
              </span>
            </div>
            <div className="mt-3 flex gap-3 flex-wrap">
              <ColorPreview color={primaryColor} label="Primary" />
              <ColorPreview color={accentColor} label="Accent" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>App Identity</CardTitle>
          <CardDescription>Customize the app name and logo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="appName">App Name</Label>
            <Input
              id="appName"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="PostFlow"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              {appName.length}/50 characters
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Shown in the sidebar header when set. Leave blank to use app name only.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="faviconUrl">Favicon URL</Label>
            <Input
              id="faviconUrl"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
            <p className="text-xs text-muted-foreground">
              Browser tab icon. Leave blank to use the default.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
          <CardDescription>Set brand colors used across the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="primaryColor">Primary Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-border p-0.5"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#6366f1"
                className="font-mono"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Main brand color (hex, e.g. #6366f1)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accentColor">Accent Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-border p-0.5"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#8b5cf6"
                className="font-mono"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Secondary accent color (hex, e.g. #8b5cf6)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            Appended to notification emails sent from the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={emailSignature}
            onChange={(e) => setEmailSignature(e.target.value)}
            placeholder="Powered by Acme Corp Social Manager"
            rows={3}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {emailSignature.length}/1000 characters
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
