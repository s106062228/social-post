"use client";

import { useState, useEffect } from "react";
import { Palette, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BrandKit {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  tagline: string | null;
  voiceGuide: string | null;
  doKeywords: string[];
  dontKeywords: string[];
}

export function BrandGuidelinesPanel() {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      void fetch("/api/brand-kit")
        .then((r) => r.json())
        .then((data: BrandKit | null) => {
          setBrandKit(data);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [loaded]);

  const hasContent =
    brandKit &&
    (brandKit.doKeywords.length > 0 ||
      brandKit.dontKeywords.length > 0 ||
      brandKit.voiceGuide ||
      brandKit.primaryColor ||
      brandKit.tagline);

  if (!loaded || !hasContent) return null;

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardContent className="p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Brand Guidelines</span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-primary/20 pt-3">
            {/* Color palette */}
            {(brandKit.primaryColor || brandKit.secondaryColor || brandKit.accentColor) && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Colors
                </p>
                <div className="flex gap-2 flex-wrap">
                  {brandKit.primaryColor && (
                    <div className="flex items-center gap-1.5" title={`Primary: ${brandKit.primaryColor}`}>
                      <div
                        className="h-4 w-4 rounded-full border border-border shadow-sm"
                        style={{ backgroundColor: brandKit.primaryColor }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{brandKit.primaryColor}</span>
                    </div>
                  )}
                  {brandKit.secondaryColor && (
                    <div className="flex items-center gap-1.5" title={`Secondary: ${brandKit.secondaryColor}`}>
                      <div
                        className="h-4 w-4 rounded-full border border-border shadow-sm"
                        style={{ backgroundColor: brandKit.secondaryColor }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{brandKit.secondaryColor}</span>
                    </div>
                  )}
                  {brandKit.accentColor && (
                    <div className="flex items-center gap-1.5" title={`Accent: ${brandKit.accentColor}`}>
                      <div
                        className="h-4 w-4 rounded-full border border-border shadow-sm"
                        style={{ backgroundColor: brandKit.accentColor }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{brandKit.accentColor}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tagline */}
            {brandKit.tagline && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tagline
                </p>
                <p className="text-sm italic text-muted-foreground">&ldquo;{brandKit.tagline}&rdquo;</p>
              </div>
            )}

            {/* Voice guide */}
            {brandKit.voiceGuide && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Voice Guide
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                  {brandKit.voiceGuide}
                </p>
              </div>
            )}

            {/* Do keywords */}
            {brandKit.doKeywords.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide">
                  ✓ Use
                </p>
                <div className="flex flex-wrap gap-1">
                  {brandKit.doKeywords.map((kw) => (
                    <Badge
                      key={kw}
                      variant="secondary"
                      className="text-xs bg-green-50 text-green-700 border-green-200"
                    >
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Don't keywords */}
            {brandKit.dontKeywords.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wide">
                  ✗ Avoid
                </p>
                <div className="flex flex-wrap gap-1">
                  {brandKit.dontKeywords.map((kw) => (
                    <Badge
                      key={kw}
                      variant="secondary"
                      className="text-xs bg-red-50 text-red-700 border-red-200"
                    >
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-1">
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <a href="/brand-kit" target="_blank" rel="noopener noreferrer">
                  Edit Brand Kit →
                </a>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
