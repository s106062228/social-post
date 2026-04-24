"use client";

import { useState, useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { extractFirstUrl } from "@/lib/url-utils";

interface OgMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
}

interface LinkPreviewCardProps {
  content: string;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />;
}

export function LinkPreviewCard({ content }: LinkPreviewCardProps) {
  const [metadata, setMetadata] = useState<OgMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const url = extractFirstUrl(content);

    if (url === detectedUrl) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!url) {
      setDetectedUrl(null);
      setMetadata(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDetectedUrl(url);
      setLoading(true);
      setMetadata(null);

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/og-preview?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: OgMetadata) => {
          if (!controller.signal.aborted) {
            setMetadata(data);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!loading && !metadata) return null;

  if (loading) {
    return (
      <div className="flex gap-3 rounded-lg border border-input bg-muted/30 p-3">
        <Skeleton className="h-16 w-20 flex-shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (!metadata || (!metadata.title && !metadata.description && !metadata.image)) {
    return null;
  }

  const hostname = (() => {
    try {
      return new URL(metadata.url).hostname;
    } catch {
      return metadata.url;
    }
  })();

  return (
    <a
      href={metadata.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-lg border border-input bg-background p-3 transition-colors hover:bg-muted/50 no-underline"
    >
      {metadata.image && (
        <div className="h-16 w-20 flex-shrink-0 overflow-hidden rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={metadata.image}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {metadata.title && (
          <p className="truncate text-sm font-medium text-foreground">{metadata.title}</p>
        )}
        {metadata.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{metadata.description}</p>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{hostname}</span>
        </div>
      </div>
    </a>
  );
}
