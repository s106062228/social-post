import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const createABTestSchema = z.object({
  name: z.string().min(1).max(200),
  postAId: z.string().min(1),
  postBId: z.string().min(1),
}).refine((data) => data.postAId !== data.postBId, {
  message: "Variant A and Variant B must be different posts",
  path: ["postBId"],
});

const POST_SELECT = {
  id: true,
  content: true,
  status: true,
  mediaType: true,
  scheduledAt: true,
  publishResults: {
    select: {
      platform: true,
      status: true,
      insights: {
        select: {
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
        },
      },
    },
  },
} as const;

export async function GET(): Promise<NextResponse> {
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

    const tests = await prisma.postABTest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        winner: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        postA: { select: POST_SELECT },
        postB: { select: POST_SELECT },
      },
    });

    return NextResponse.json({ tests });
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const body: unknown = await request.json();
    const parsed = createABTestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, postAId, postBId } = parsed.data;

    // Verify both posts belong to the current user
    const [postA, postB] = await Promise.all([
      prisma.post.findUnique({ where: { id: postAId, userId: session.user.id } }),
      prisma.post.findUnique({ where: { id: postBId, userId: session.user.id } }),
    ]);

    if (!postA) {
      return NextResponse.json({ error: "Variant A post not found" }, { status: 404 });
    }
    if (!postB) {
      return NextResponse.json({ error: "Variant B post not found" }, { status: 404 });
    }

    const test = await prisma.postABTest.create({
      data: {
        userId: session.user.id,
        name,
        postAId,
        postBId,
      },
      select: {
        id: true,
        name: true,
        winner: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        postA: { select: POST_SELECT },
        postB: { select: POST_SELECT },
      },
    });

    return NextResponse.json({ test }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
