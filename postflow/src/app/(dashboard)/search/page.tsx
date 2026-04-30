"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  LayoutTemplate,
  Megaphone,
  Tag,
  Hash,
  SearchIcon,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PostResult {
  type: "post";
  id: string;
  label: string;
  status: string;
  scheduledAt?: string | null;
  href: string;
}

interface TemplateResult {
  type: "template";
  id: string;
  label: string;
  preview: string;
  href: string;
}

interface CampaignResult {
  type: "campaign";
  id: string;
  label: string;
  description?: string;
  isActive: boolean;
  href: string;
}

interface TagResult {
  type: "tag";
  id: string;
  label: string;
  color: string;
  href: string;
}

interface HashtagGroupResult {
  type: "hashtagGroup";
  id: string;
  label: string;
  preview: string;
  href: string;
}

type SearchResult = PostResult | TemplateResult | CampaignResult | TagResult | HashtagGroupResult;

interface SearchResults {
  query: string;
  results: {
    posts: PostResult[];
    templates: TemplateResult[];
    campaigns: CampaignResult[];
    tags: TagResult[];
    hashtagGroups: HashtagGroupResult[];
  };
}

// ── Tab config ────────────────────────────────────────────────────────────────

type Tab = "all" | "posts" | "templates" | "campaigns" | "tags";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "posts", label: "Posts" },
  { id: "templates", label: "Templates" },
  { id: "campaigns", label: "Campaigns" },
  { id: "tags", label: "Tags & Hashtags" },
];

// ── Icon helpers ──────────────────────────────────────────────────────────────

function ResultIcon({ type }: { type: SearchResult["type"] }) {
  switch (type) {
    case "post": return <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
    case "template": return <LayoutTemplate className="h-4 w-4 text-purple-500 shrink-0" />;
    case "campaign": return <Megaphone className="h-4 w-4 text-orange-500 shrink-0" />;
    case "tag": return <Tag className="h-4 w-4 text-green-500 shrink-0" />;
    case "hashtagGroup": return <Hash className="h-4 w-4 text-indigo-500 shrink-0" />;
  }
}

function ResultItem({ result }: { result: SearchResult }) {
  return (
    <Link
      href={result.href}
      className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
    >
      <ResultIcon type={result.type} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{result.label}</p>
        {result.type === "post" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <Badge variant="outline" className="text-xs mr-1">{result.status}</Badge>
            {result.scheduledAt && new Date(result.scheduledAt).toLocaleDateString()}
          </p>
        )}
        {result.type === "template" && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.preview}</p>
        )}
        {result.type === "campaign" && result.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.description}</p>
        )}
        {result.type === "tag" && (
          <div className="mt-0.5 flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: result.color }}
            />
            <span className="text-xs text-muted-foreground">tag</span>
          </div>
        )}
        {result.type === "hashtagGroup" && (
          <p className="text-xs text-muted-foreground mt-0.5">{result.preview}</p>
        )}
      </div>
    </Link>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [data, setData] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const json = (await res.json()) as { error: string };
        setError(json.error ?? "Search failed");
        setData(null);
      } else {
        setData((await res.json()) as SearchResults);
      }
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(query);
      // Sync URL without navigation
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query); else params.delete("q");
      router.replace(`/search?${params.toString()}`, { scroll: false });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch, router, searchParams]);

  // Run initial search if URL has ?q=
  useEffect(() => {
    if (initialQ.length >= 2) void doSearch(initialQ);
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allResults: SearchResult[] = data
    ? [
        ...data.results.posts,
        ...data.results.templates,
        ...data.results.campaigns,
        ...data.results.tags,
        ...data.results.hashtagGroups,
      ]
    : [];

  const tabResults: Record<Tab, SearchResult[]> = {
    all: allResults,
    posts: data?.results.posts ?? [],
    templates: data?.results.templates ?? [],
    campaigns: data?.results.campaigns ?? [],
    tags: [...(data?.results.tags ?? []), ...(data?.results.hashtagGroups ?? [])],
  };

  const counts: Record<Tab, number> = {
    all: allResults.length,
    posts: data?.results.posts.length ?? 0,
    templates: data?.results.templates.length ?? 0,
    campaigns: data?.results.campaigns.length ?? 0,
    tags: (data?.results.tags.length ?? 0) + (data?.results.hashtagGroups.length ?? 0),
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Search</h1>

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts, templates, campaigns, tags…"
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {data && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {counts[tab.id] > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                    {counts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Results */}
          {tabResults[activeTab].length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No results found for &quot;{data.query}&quot;
            </p>
          ) : (
            <div className="space-y-2">
              {tabResults[activeTab].map((r) => (
                <ResultItem key={`${r.type}-${r.id}`} result={r} />
              ))}
            </div>
          )}
        </>
      )}

      {!data && !loading && query.length < 2 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}
