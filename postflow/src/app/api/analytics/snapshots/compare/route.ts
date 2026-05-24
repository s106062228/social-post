import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

interface SnapshotData {
  posts: { total: number; published: number; failed: number; scheduled: number; draft: number };
  publishResults: { total: number; published: number; overallSuccessRate: number };
  platformBreakdown: Array<{ platform: string; published: number; failed: number; total: number }>;
  connectedAccounts: number;
  takenAt: string;
}

function delta(a: number, b: number) {
  return { from: a, to: b, change: b - a, changePct: a > 0 ? Math.round(((b - a) / a) * 100) : null };
}

// ── GET /api/analytics/snapshots/compare ─────────────────────────────────────

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
    const fromId = searchParams.get("from");
    const toId = searchParams.get("to");

    if (!fromId || !toId) {
      return NextResponse.json(
        { error: "Both 'from' and 'to' snapshot IDs are required" },
        { status: 400 }
      );
    }

    const [fromSnapshot, toSnapshot] = await Promise.all([
      prisma.analyticsSnapshot.findFirst({
        where: { id: fromId, userId: session.user.id },
        select: { id: true, name: true, data: true, createdAt: true },
      }),
      prisma.analyticsSnapshot.findFirst({
        where: { id: toId, userId: session.user.id },
        select: { id: true, name: true, data: true, createdAt: true },
      }),
    ]);

    if (!fromSnapshot || !toSnapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const fromData = fromSnapshot.data as unknown as SnapshotData;
    const toData = toSnapshot.data as unknown as SnapshotData;

    const comparison = {
      from: { id: fromSnapshot.id, name: fromSnapshot.name, createdAt: fromSnapshot.createdAt },
      to: { id: toSnapshot.id, name: toSnapshot.name, createdAt: toSnapshot.createdAt },
      deltas: {
        totalPosts: delta(fromData.posts.total, toData.posts.total),
        publishedPosts: delta(fromData.posts.published, toData.posts.published),
        failedPosts: delta(fromData.posts.failed, toData.posts.failed),
        scheduledPosts: delta(fromData.posts.scheduled, toData.posts.scheduled),
        draftPosts: delta(fromData.posts.draft, toData.posts.draft),
        overallSuccessRate: delta(fromData.publishResults.overallSuccessRate, toData.publishResults.overallSuccessRate),
        connectedAccounts: delta(fromData.connectedAccounts, toData.connectedAccounts),
      },
    };

    return NextResponse.json({ comparison });
  } catch (err) {
    return handleRouteError(err);
  }
}
