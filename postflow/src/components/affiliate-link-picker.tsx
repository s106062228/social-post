"use client";

import { useState, useEffect, useRef } from "react";
import { Link2, ChevronDown } from "lucide-react";

interface AffiliateLink {
  id: string;
  name: string;
  originalUrl: string;
  affiliateCode: string | null;
  platform: string | null;
  category: string | null;
  isActive: boolean;
}

interface Props {
  onInsert: (url: string, name: string) => void;
}

function buildTrackingUrl(link: AffiliateLink): string {
  if (!link.affiliateCode) return link.originalUrl;
  try {
    const url = new URL(link.originalUrl);
    url.searchParams.set("ref", link.affiliateCode);
    return url.toString();
  } catch {
    return `${link.originalUrl}?ref=${link.affiliateCode}`;
  }
}

export function AffiliateLinkPicker({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/affiliate-links")
      .then((r) => r.json())
      .then((d) => setLinks((d.links ?? []).filter((l: AffiliateLink) => l.isActive)))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(link: AffiliateLink) {
    const url = buildTrackingUrl(link);
    onInsert(url, link.name);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
      >
        <Link2 className="h-3 w-3" />
        Affiliate Link
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-card shadow-lg">
          {loading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading...</p>
          ) : links.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No active affiliate links. Add them in{" "}
              <a href="/affiliate-links" className="underline">
                Affiliates
              </a>
              .
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {links.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(link)}
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="text-sm font-medium">{link.name}</span>
                    <span className="flex gap-2 text-xs text-muted-foreground">
                      {link.platform && <span>{link.platform}</span>}
                      {link.category && <span>· {link.category}</span>}
                      {link.affiliateCode && <span>· ref={link.affiliateCode}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
