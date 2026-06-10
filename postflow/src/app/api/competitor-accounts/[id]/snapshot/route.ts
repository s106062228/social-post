import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const snapshotSchema = z.object({
  followersCount: z.number().int().min(0).optional(),
  avgEngagementRate: z.number().min(0).max(100).optional(),
  postsPerWeek: z.number().min(0).optional(),
  avgLikes: z.number().min(0).optional(),
  avgComments: z.number().min(0).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;

    const competitor = await prisma.competitorAccount.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = snapshotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const snapshot = await prisma.competitorSnapshot.create({
      data: {
        competitorId: id,
        followersCount: parsed.data.followersCount ?? null,
        avgEngagementRate: parsed.data.avgEngagementRate ?? null,
        postsPerWeek: parsed.data.postsPerWeek ?? null,
        avgLikes: parsed.data.avgLikes ?? null,
        avgComments: parsed.data.avgComments ?? null,
      },
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
