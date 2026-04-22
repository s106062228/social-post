import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const exportQuerySchema = z.object({
  status: z.nativeEnum(PostStatus).optional(),
  search: z.string().max(200).optional(),
});

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

// ── GET /api/posts/export ─────────────────────────────────────────────────────

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

    const userId = session.user.id;

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = exportQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status: statusFilter, search } = parsed.data;

    const posts = await prisma.post.findMany({
      where: {
        userId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { content: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        status: true,
        mediaType: true,
        scheduledAt: true,
        createdAt: true,
        publishResults: {
          where: { status: "PUBLISHED" },
          select: { platform: true },
        },
      },
    });

    const header = rowToCsv([
      "id",
      "content",
      "status",
      "mediaType",
      "scheduledAt",
      "createdAt",
      "publishedPlatforms",
    ]);

    const rows = posts.map((post) => {
      const platforms = [...new Set(post.publishResults.map((r) => r.platform))].join(
        "|"
      );
      return rowToCsv([
        post.id,
        post.content,
        post.status,
        post.mediaType,
        post.scheduledAt ? post.scheduledAt.toISOString() : "",
        post.createdAt.toISOString(),
        platforms,
      ]);
    });

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="posts-export.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
