"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Store,
  Search,
  Download,
  CheckCircle,
  Loader2,
  FileText,
  Tag,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface MarketplaceTemplate {
  id: string;
  name: string;
  content: string;
  mediaType: string;
  marketplaceCategory: string | null;
  marketplaceTags: string[];
  importCount: number;
  createdAt: string;
}

interface MarketplaceResponse {
  templates: MarketplaceTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const CATEGORIES = [
  "Marketing",
  "Social Media",
  "Education",
  "Business",
  "Entertainment",
  "News",
  "Personal",
  "Other",
];

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category) params.set("category", category);
      if (tag) params.set("tag", tag);

      const res = await fetch(`/api/marketplace/templates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as MarketplaceResponse;
      setTemplates(data.templates);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load marketplace templates");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, category, tag]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, tag]);

  async function handleImport(templateId: string) {
    setImportingId(templateId);
    try {
      const res = await fetch(`/api/marketplace/templates/${templateId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to import");
      }
      const data = (await res.json()) as {
        alreadyImported: boolean;
        newTemplateId: string | null;
      };
      if (data.alreadyImported) {
        toast.info("Template already in your library");
      } else {
        toast.success("Template imported to your library");
        setImportedIds((prev) => new Set(prev).add(templateId));
        // Update local import count
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? { ...t, importCount: t.importCount + 1 }
              : t
          )
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" />
            Template Marketplace
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and import community-shared post templates
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {total > 0 && `${total} template${total !== 1 ? "s" : ""} available`}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {(category || tag || debouncedSearch) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCategory("");
              setTag("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Tag filter pills */}
      {tag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tag:</span>
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setTag("")}
          >
            {tag} ×
          </Badge>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm">
            {debouncedSearch || category || tag
              ? "Try adjusting your filters"
              : "Be the first to publish a template to the marketplace"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const alreadyImported = importedIds.has(template.id);
            return (
              <Card key={template.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight line-clamp-2">
                      {template.name}
                    </CardTitle>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {template.marketplaceCategory && (
                      <Badge variant="secondary" className="text-xs">
                        {template.marketplaceCategory}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {template.importCount}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 pb-2">
                  <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                    {template.content}
                  </p>

                  {template.marketplaceTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {template.marketplaceTags.slice(0, 5).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTag(t)}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={importingId === template.id || alreadyImported}
                    onClick={() => handleImport(template.id)}
                    variant={alreadyImported ? "secondary" : "default"}
                  >
                    {importingId === template.id ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Importing…
                      </>
                    ) : alreadyImported ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-2" />
                        Imported
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3 mr-2" />
                        Import Template
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
