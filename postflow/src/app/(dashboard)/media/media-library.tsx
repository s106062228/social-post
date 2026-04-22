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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  publicUrl: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  const loadMore = useCallback(async () => {
    if (pagination.page >= pagination.totalPages) return;
    setLoadingMore(true);
    try {
      const nextPage = pagination.page + 1;
      const res = await fetch(`/api/media?page=${nextPage}&limit=${pagination.limit}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as { assets: MediaAsset[]; pagination: Pagination };
      setAssets((prev) => [...prev, ...data.assets]);
      setPagination(data.pagination);
    } catch {
      toast({ title: "Failed to load more assets", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [pagination, toast]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
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
          <p className="text-sm font-medium text-muted-foreground">No media assets yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Click &quot;Upload Files&quot; or drag and drop here
          </p>
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
                      alt={asset.filename}
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
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    title="Copy URL"
                    onClick={() => handleCopy(asset)}
                  >
                    {copiedId === asset.id ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    title="Delete"
                    disabled={deletingId === asset.id}
                    onClick={() => handleDelete(asset)}
                  >
                    {deletingId === asset.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Filename + size */}
                <div className="px-2 py-1.5">
                  <p
                    className="truncate text-xs font-medium"
                    title={asset.filename}
                  >
                    {asset.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
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
    </div>
  );
}
