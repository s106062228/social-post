"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, CheckCircle, XCircle, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import { parseICS, icsEventsToPostDrafts, type ParsedEvent } from "@/lib/ical-import";

interface ImportResult {
  imported: number;
  skipped: string[];
  postIds: string[];
  message: string;
}

export default function CalendarImportPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<ParsedEvent[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".ics") && !file.name.toLowerCase().endsWith(".ical")) {
      toast.error("Only .ics / .ical files are supported");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2 MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { events, parseErrors: errs } = parseICS(text);
      setPreviewEvents(events);
      setParseErrors(errs);
      setSelectedFile(file);
      setResult(null);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  async function handleImport() {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/calendar/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }
      setResult(data);
      toast.success(data.message);
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setSelectedFile(null);
    setPreviewEvents(null);
    setParseErrors([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const { drafts } = previewEvents
    ? icsEventsToPostDrafts(previewEvents)
    : { drafts: [] };

  return (
    <div className="flex flex-col gap-8 p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/calendar">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calendar
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Calendar</h1>
          <p className="text-muted-foreground">
            Import events from an .ics / iCal file as draft posts.
          </p>
        </div>
      </div>

      {/* Upload area */}
      {!selectedFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-16 cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-semibold">Drop your .ics file here</p>
            <p className="text-sm text-muted-foreground">or click to browse — max 2 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,.ical"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Preview */}
      {selectedFile && !result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Remove
            </Button>
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                Parse warnings ({parseErrors.length})
              </p>
              <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-400 space-y-1">
                {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {drafts.length === 0 && previewEvents?.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No events found in this file.
            </div>
          )}

          {drafts.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {drafts.length} event{drafts.length === 1 ? "" : "s"} to import
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleReset}>Cancel</Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? "Importing…" : `Import ${drafts.length} post${drafts.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border divide-y max-h-[480px] overflow-y-auto">
                {drafts.map((draft, i) => (
                  <div key={i} className="flex items-start gap-4 p-4">
                    <Calendar className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {draft.scheduledAt.toLocaleString(undefined, {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {draft.content.split("\n")[0]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-300">
                {result.message}
              </p>
              {result.skipped.length > 0 && (
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  {result.skipped.length} event{result.skipped.length === 1 ? "" : "s"} skipped
                </p>
              )}
            </div>
          </div>

          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                Skipped events
              </p>
              <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-400 space-y-1">
                {result.skipped.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              Import another file
            </Button>
            <Button asChild>
              <Link href="/posts">View imported posts</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Format guide */}
      {!selectedFile && (
        <div className="rounded-lg border p-6 bg-muted/20">
          <h3 className="font-semibold mb-3">Supported format</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Standard RFC 5545 iCalendar (.ics) files</li>
            <li>VEVENT entries with SUMMARY, DESCRIPTION, and DTSTART fields</li>
            <li>Events are imported as DRAFT posts with the event start time as scheduledAt</li>
            <li>Content is built from: event summary + description + location</li>
            <li>Maximum 100 events per import</li>
          </ul>
        </div>
      )}
    </div>
  );
}
