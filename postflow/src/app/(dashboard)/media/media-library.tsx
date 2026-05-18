"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Upload,
  Trash2,
  Copy,
  Check,
  FileVideo,
  ImageIcon,
  Loader2,
  Sparkles,
  Search,
  Tag,
  X,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  publicUrl: string;
  description: string | null;
  tags: string[];
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface MediaLibraryProps {
  initialAssets: MediaAsset[];
  initialPagination: Pagination;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function MediaLibrary({ initialAssets, initialPagination }: MediaLibraryProps) {
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets);
  const [pagination, setPagination] = useState<Pagination>(initialPagination);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoTaggingId, setAutoTaggingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searching, setSearching] = useState(false);
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchAssets = useCallback(
    async (opts: { search?: string; tag?: string; page?: number; append?: boolean }) => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (opts.search) params.set("search", opts.search);
        if (opts.tag) params.set("tag", opts.tag);
        if (opts.page) params.set("page", String(opts.page));
        const res = await fetch(`/api/media?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { assets: MediaAsset[]; pagination: Pagination };
        if (opts.append) {
          setAssets((prev) => [...prev, ...data.assets]);
        } else {
          setAssets(data.assets);
        }
        setPagination(data.pagination);
      } catch {
        toast({ title: "Failed to load assets", variant: "destructive" });
      } finally {
        setSearching(false);
      }
    },
    [toast]
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      fetchAssets({ search, tag: tagFilter });
    },
    [fetchAssets, search, tagFilter]
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setTagFilter("");
    fetchAssets({});
  }, [fetchAssets]);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      let successCount = 0;
      const newAssets: MediaAsset[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/media", { method: "POST", body: formData });
          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            toast({
              title: "Upload failed",
              description: body.error ?? `Could not upload ${file.name}`,
              variant: "destructive",
            });
            continue;
          }
          const asset = (await res.json()) as MediaAsset;
          newAssets.push(asset);
          successCount++;
        } catch {
          toast({
            title: "Upload failed",
            description: `Could not upload ${file.name}`,
            variant: "destructive",
          });
        }
      }

      if (successCount > 0) {
        setAssets((prev) => [...newAssets, ...prev]);
        setPagination((prev) => ({ ...prev, total: prev.total + successCount }));
        toast({
          title: "Upload complete",
          description: `${successCount} file${successCount > 1 ? "s" : ""} uploaded`,
        });
      }

      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [toast]
  );

  const handleDelete = useCallback(
    async (asset: MediaAsset) => {
      if (!confirm(`Delete "${asset.filename}"? This cannot be undone.`)) return;

      setDeletingId(asset.id);
      try {
        const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          toast({
            title: "Delete failed",
            description: body.error ?? "Could not delete asset",
            variant: "destructive",
          });
          return;
        }
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        toast({ title: "Asset deleted" });
      } catch {
        toast({ title: "Delete failed", description: "Network error", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast]
  );

  const handleCopy = useCallback(
    async (asset: MediaAsset) => {
      try {
        await navigator.clipboard.writeText(asset.publicUrl);
        setCopiedId(asset.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast({ title: "URL copied to clipboard" });
      } catch {
        toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
      }
    },
    [toast]
  );

  const handleAutoTag = useCallback(
    async (asset: MediaAsset) => {
      setAutoTaggingId(asset.id);
      try {
        const res = await fetch(`/api/media/${asset.id}/tags`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          toast({
            title: "Auto-tag failed",
            description: body.error ?? "Could not generate tags",
            variant: "destructive",
          });
          return;
        }
        const { tags } = (await res.json()) as { tags: string[] };
        setAssets((prev) =>
          prev.map((a) => (a.id === asset.id ? { ...a, tags } : a))
        );
        if (detailAsset?.id === asset.id) {
          setDetailAsset((prev) => prev ? { ...prev, tags } : prev);
        }
        toast({
          title: "Tags generated",
          description: `${tags.length} tag${tags.length !== 1 ? "s" : ""} added`,
        });
      } catch {
        toast({ title: "Auto-tag failed", description: "Network error", variant: "destructive" });
      } finally {
        setAutoTaggingId(null);
      }
    },
    [toast, detailAsset]
  );

  const openDetail = useCallback((asset: MediaAsset) => {
    setDetailAsset(asset);
    setEditDesc(asset.description ?? "");
  }, []);

  const saveDetail = useCallback(async () => {
    if (!detailAsset) return;
    setSavingDetail(true);
    try {
      const res = await fetch(`/api/media/${detailAsset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDesc }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast({ title: "Save failed", description: body.error ?? "Could not save", variant: "destructive" });
        return;
      }
      const updated = (await res.json()) as MediaAsset;
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setDetailAsset(updated);
      toast({ title: "Description saved" });
    } catch {
      toast({ title: "Save failed", description: "Network error", variant: "destructive" });
    } finally {
      setSavingDetail(false);
    }
  }, [detailAsset, editDesc, toast]);

  const loadMore = useCallback(async () => {
    if (pagination.page >= pagination.totalPages) return;
    setLoadingMore(true);
    try {
      const nextPage = pagination.page + 1;
      const params = new URLSearchParams({ page: String(nextPage) });
      if (search) params.set("search", search);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`/api/media?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as { assets: MediaAsset[]; pagination: Pagination };
      setAssets((prev) => [...prev, ...data.assets]);
      setPagination(data.pagination);
    } catch {
      toast({ title: "Failed to load more assets", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [pagination, search, tagFilter, toast]);

  const hasFilters = search.trim() !== "" || tagFilter.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination.total} asset{pagination.total !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload Files"}
          </Button>
        </div>
      </div>

      {/* Search + tag filter */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename or description…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative sm:w-48">
          <Tag className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by tag…"
            className="pl-8"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
        {hasFilters && (
          <Button type="button" variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
            <X className="h-4 w-4" />
          </Button>
        )}
      </form>

      {/* Grid */}
      {assets.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleUpload(e.dataTransfer.files);
          }}
        >
          <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {hasFilters ? "No assets match your filters" : "No media assets yet"}
          </p>
          {!hasFilters && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              Click &quot;Upload Files&quot; or drag and drop here
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
          >
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-lg border bg-muted/30"
              >
                {/* Thumbnail */}
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  {isImage(asset.mimeType) ? (
                    <Image
                      src={asset.publicUrl}
                      alt={asset.description ?? asset.filename}
                      width={200}
                      height={200}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileVideo className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                  )}
                </div>

                {/* Overlay actions */}
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    title="Details"
                    onClick={() => openDetail(asset)}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                  {isImage(asset.mimeType) && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      title="Auto-tag with AI"
                      disabled={autoTaggingId === asset.id}
                      onClick={() => handleAutoTag(asset)}
                    >
                      {autoTaggingId === asset.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    title="Copy URL"
                    onClick={() => handleCopy(asset)}
                  >
                    {copiedId === asset.id ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    title="Delete"
                    disabled={deletingId === asset.id}
                    onClick={() => handleDelete(asset)}
                  >
                    {deletingId === asset.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                {/* Filename + size + tags */}
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium" title={asset.filename}>
                    {asset.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
                  {asset.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {asset.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                      {asset.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{asset.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load more */}
          {pagination.page < pagination.totalPages && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailAsset} onOpenChange={(open) => { if (!open) setDetailAsset(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">{detailAsset?.filename}</DialogTitle>
          </DialogHeader>
          {detailAsset && (
            <div className="flex flex-col gap-4">
              {/* Preview */}
              {isImage(detailAsset.mimeType) ? (
                <div className="overflow-hidden rounded-lg border bg-muted">
                  <Image
                    src={detailAsset.publicUrl}
                    alt={detailAsset.description ?? detailAsset.filename}
                    width={480}
                    height={300}
                    className="h-48 w-full object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg border bg-muted">
                  <FileVideo className="h-12 w-12 text-muted-foreground/50" />
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Size:</span>{" "}
                  {formatBytes(detailAsset.size)}
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>{" "}
                  {detailAsset.mimeType}
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="min-h-[60px] w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Add a description…"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={1000}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={saveDetail}
                  disabled={savingDetail || editDesc === (detailAsset.description ?? "")}
                >
                  {savingDetail ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save description
                </Button>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tags</span>
                  {isImage(detailAsset.mimeType) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={autoTaggingId === detailAsset.id}
                      onClick={() => handleAutoTag(detailAsset)}
                    >
                      {autoTaggingId === detailAsset.id ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3 w-3" />
                      )}
                      Auto-tag with AI
                    </Button>
                  )}
                </div>
                {detailAsset.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {detailAsset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No tags yet. Use &quot;Auto-tag with AI&quot; to generate tags.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
