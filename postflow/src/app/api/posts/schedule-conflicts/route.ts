import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { detectConflicts } from "@/lib/schedule-conflicts";

const querySchema = z.object({
  windowMinutes: z.coerce.number().int().min(1).max(1440).default(30),
});

// ── GET /api/posts/schedule-conflicts ────────────────────────────────────────

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

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ windowMinutes: searchParams.get("windowMinutes") ?? 30 });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { windowMinutes } = parsed.data;

    const scheduledPosts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: PostStatus.SCHEDULED,
        scheduledAt: { not: null },
        archivedAt: null,
      },
      select: {
        id: true,
        scheduledAt: true,
        publishResults: { select: { platform: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const conflicts = detectConflicts(
      scheduledPosts.map((p) => ({ ...p, scheduledAt: p.scheduledAt! })),
      windowMinutes
    );

    return NextResponse.json({
      conflicts,
      totalConflicts: conflicts.length,
      windowMinutes,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
