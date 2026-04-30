"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { ImportStatus } from "@prisma/client";

interface RowError {
  row: number;
  errors: string[];
}

interface BatchRecord {
  id: string;
  filename: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: RowError[];
  status: ImportStatus;
  createdAt: string;
}

interface ImportResult {
  batchId: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: RowError[];
  status: ImportStatus;
}

function StatusIcon({ status }: { status: ImportStatus }) {
  if (status === ImportStatus.COMPLETED) return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === ImportStatus.FAILED) return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

function BatchRow({ batch }: { batch: BatchRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon status={batch.status} />
          <div className="min-w-0">
            <p className="font-medium truncate">{batch.filename}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(batch.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0 text-sm">
          <span className="text-muted-foreground">
            {batch.totalRows} rows
          </span>
          <span className="text-green-600 font-medium">{batch.successRows} imported</span>
          {batch.failedRows > 0 && (
            <span className="text-red-500 font-medium">{batch.failedRows} failed</span>
          )}
          {batch.errors.length > 0 && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Details
            </button>
          )}
        </div>
      </div>

      {expanded && batch.errors.length > 0 && (
        <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Row errors:</p>
          <ul className="space-y-1">
            {batch.errors.map((e, i) => (
              <li key={i} className="text-sm text-red-700 dark:text-red-400">
                <span className="font-medium">Row {e.row}:</span> {e.errors.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ImportClient({ initialBatches }: { initialBatches: BatchRecord[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batches, setBatches] = useState<BatchRecord[]>(initialBatches);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Only .csv files are supported");
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/posts/import", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }

      setResult(data as ImportResult);

      if (data.successRows > 0) {
        toast.success(`Imported ${data.successRows} post${data.successRows !== 1 ? "s" : ""}`);
      }
      if (data.failedRows > 0) {
        toast.warning(`${data.failedRows} row${data.failedRows !== 1 ? "s" : ""} had errors`);
      }

      // Refresh batch list
      const listRes = await fetch("/api/posts/import");
      if (listRes.ok) {
        const listData = await listRes.json();
        setBatches(listData.batches);
      }
    } catch {
      toast.error("Network error during upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* CSV format guide */}
      <div className="rounded-lg border bg-muted/30 p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          CSV Format Guide
        </h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Your CSV must have a header row. Supported columns:</p>
          <table className="w-full text-xs border-collapse mt-2">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 pr-4 font-semibold">Column</th>
                <th className="text-left py-1 pr-4 font-semibold">Required</th>
                <th className="text-left py-1 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1 pr-4 font-mono">content</td>
                <td className="py-1 pr-4 text-red-500">Yes</td>
                <td className="py-1">Post text (max 63,206 chars)</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4 font-mono">scheduledAt</td>
                <td className="py-1 pr-4 text-muted-foreground">No</td>
                <td className="py-1">ISO 8601 datetime (e.g. 2026-05-01T10:00:00Z). Omit for DRAFT.</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4 font-mono">mediaType</td>
                <td className="py-1 pr-4 text-muted-foreground">No</td>
                <td className="py-1">NONE / IMAGE / VIDEO / CAROUSEL (default: NONE)</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 pr-4 font-mono">mediaUrls</td>
                <td className="py-1 pr-4 text-muted-foreground">No</td>
                <td className="py-1">Pipe-separated public URLs (e.g. https://…|https://…)</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-mono">platforms</td>
                <td className="py-1 pr-4 text-muted-foreground">No</td>
                <td className="py-1">Pipe-separated: FACEBOOK|INSTAGRAM|THREADS</td>
              </tr>
            </tbody>
          </table>
          <p className="pt-1">
            Maximum <span className="font-semibold">100 rows</span> per import. File size limit: 2 MB.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50"
        } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={onFileChange}
          disabled={uploading}
        />
        <Upload className="h-10 w-10 text-muted-foreground mb-3" />
        {uploading ? (
          <p className="text-sm font-medium">Uploading and processing…</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drop your CSV here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Only .csv files • max 2 MB • max 100 rows</p>
          </>
        )}
      </div>

      {/* Last import result */}
      {result && (
        <div className={`rounded-lg border p-5 ${result.failedRows === result.totalRows ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-green-300 bg-green-50 dark:bg-green-950/20"}`}>
          <h3 className="font-semibold mb-3">Import Result</h3>
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{result.totalRows}</p>
              <p className="text-muted-foreground">Total rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{result.successRows}</p>
              <p className="text-muted-foreground">Imported</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${result.failedRows > 0 ? "text-red-500" : "text-muted-foreground"}`}>{result.failedRows}</p>
              <p className="text-muted-foreground">Failed</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Row errors:</p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-sm text-red-700 dark:text-red-400">
                    <span className="font-medium">Row {e.row}:</span> {e.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Import history */}
      {batches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Import History</h2>
          <div className="flex flex-col gap-3">
            {batches.map((b) => (
              <BatchRow key={b.id} batch={b} />
            ))}
          </div>
        </div>
      )}

      {batches.length === 0 && !result && (
        <p className="text-center text-muted-foreground text-sm py-6">
          No imports yet. Upload a CSV file to get started.
        </p>
      )}
    </div>
  );
}
