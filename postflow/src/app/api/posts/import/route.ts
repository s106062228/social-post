import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, Platform, PostStatus, ImportStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";
import { logActivity } from "@/lib/activity-log";

const MAX_ROWS = 100;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const VALID_PLATFORMS = Object.values(Platform);

const rowSchema = z.object({
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.string().optional(),
  scheduledAt: z.string().optional(),
  platforms: z.string().optional(),
});

interface RowError {
  row: number;
  errors: string[];
}

interface ParsedRow {
  content: string;
  mediaType: MediaType;
  mediaUrls: string[];
  scheduledAt: Date | null;
  platforms: Platform[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (ch === "," && !insideQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function validateRow(
  raw: Record<string, string>,
  rowIndex: number
): { success: true; data: ParsedRow } | { success: false; errors: string[] } {
  const errors: string[] = [];

  const parsed = rowSchema.safeParse({
    content: raw["content"] ?? "",
    mediaType: raw["mediatype"] ?? raw["media_type"] ?? MediaType.NONE,
    mediaUrls: raw["mediaurls"] ?? raw["media_urls"] ?? "",
    scheduledAt: raw["scheduledat"] ?? raw["scheduled_at"] ?? "",
    platforms: raw["platforms"] ?? "",
  });

  if (!parsed.success) {
    parsed.error.issues.forEach((e: { path: (string | number)[]; message: string }) =>
      errors.push(`${e.path.join(".")}: ${e.message}`)
    );
    return { success: false, errors };
  }

  const { content, mediaType, mediaUrls: mediaUrlsRaw, scheduledAt: scheduledAtRaw, platforms: platformsRaw } = parsed.data;

  const sanitized = sanitizePostContent(content);
  if (sanitized.length === 0) {
    errors.push("content: must not be empty after sanitization");
  }

  let scheduledAt: Date | null = null;
  if (scheduledAtRaw && scheduledAtRaw.trim() !== "") {
    const d = new Date(scheduledAtRaw);
    if (isNaN(d.getTime())) {
      errors.push("scheduledAt: invalid date format");
    } else if (d < new Date()) {
      errors.push("scheduledAt: must be in the future");
    } else {
      scheduledAt = d;
    }
  }

  const mediaUrls: string[] = [];
  if (mediaUrlsRaw && mediaUrlsRaw.trim() !== "") {
    const parts = mediaUrlsRaw.split("|").map((u: string) => u.trim()).filter(Boolean);
    for (const url of parts) {
      const urlParsed = z.string().url().safeParse(url);
      if (!urlParsed.success) {
        errors.push(`mediaUrls: "${url}" is not a valid URL`);
      } else {
        mediaUrls.push(url);
      }
    }
  }

  const platforms: Platform[] = [];
  if (platformsRaw && platformsRaw.trim() !== "") {
    const parts = platformsRaw.split("|").map((p: string) => p.trim().toUpperCase());
    for (const p of parts) {
      if (!VALID_PLATFORMS.includes(p as Platform)) {
        errors.push(`platforms: "${p}" is not a valid platform (FACEBOOK, INSTAGRAM, THREADS)`);
      } else {
        platforms.push(p as Platform);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      content: sanitized,
      mediaType,
      mediaUrls,
      scheduledAt,
      platforms,
    },
  };
}

// ── GET /api/posts/import ─────────────────────────────────────────────────────
// Returns list of past import batches for this user.

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const batches = await prisma.importBatch.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ batches });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/import ────────────────────────────────────────────────────
// Accepts multipart/form-data with a CSV file.
// Expected columns: content, mediaType, mediaUrls (pipe-separated), scheduledAt, platforms (pipe-separated)

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 2 MB)" },
        { status: 413 }
      );
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only .csv files are accepted" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const { headers, rows } = parseCsv(text);

    if (!headers.includes("content")) {
      return NextResponse.json(
        { error: "CSV must have a 'content' column" },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV file contains no data rows" },
        { status: 400 }
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `CSV exceeds maximum of ${MAX_ROWS} rows per import` },
        { status: 422 }
      );
    }

    const userId = session.user.id;
    const rowErrors: RowError[] = [];
    const validRows: ParsedRow[] = [];

    rows.forEach((raw, idx) => {
      const result = validateRow(raw, idx + 2);
      if (result.success) {
        validRows.push(result.data);
      } else {
        rowErrors.push({ row: idx + 2, errors: result.errors });
      }
    });

    let successRows = 0;
    if (validRows.length > 0) {
      await prisma.post.createMany({
        data: validRows.map((r) => ({
          userId,
          content: r.content,
          mediaType: r.mediaType,
          mediaUrls: r.mediaUrls,
          scheduledAt: r.scheduledAt,
          status: r.scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
          approvalStatus: "NONE" as const,
        })),
      });
      successRows = validRows.length;
    }

    const batchStatus: ImportStatus =
      rowErrors.length === 0
        ? ImportStatus.COMPLETED
        : successRows === 0
          ? ImportStatus.FAILED
          : ImportStatus.COMPLETED;

    const batch = await prisma.importBatch.create({
      data: {
        userId,
        filename: file.name,
        totalRows: rows.length,
        successRows,
        failedRows: rowErrors.length,
        errors: JSON.parse(JSON.stringify(rowErrors)),
        status: batchStatus,
      },
    });

    logActivity({
      userId,
      action: "post.imported",
      entityId: batch.id,
      entityType: "ImportBatch",
      metadata: { filename: file.name, successRows, failedRows: rowErrors.length },
    });

    return NextResponse.json(
      {
        batchId: batch.id,
        totalRows: rows.length,
        successRows,
        failedRows: rowErrors.length,
        errors: rowErrors,
        status: batchStatus,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
