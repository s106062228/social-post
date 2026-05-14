import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { checkBrandCompliance } from "@/lib/brand-compliance";

const postIdSchema = z.string().cuid();

export async function POST(
  _request: NextRequest,
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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, content: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const brandKit = await prisma.brandKit.findUnique({
      where: { userId: session.user.id },
      select: { doKeywords: true, dontKeywords: true },
    });

    if (!brandKit) {
      return NextResponse.json({ violations: [], compliant: true, score: 100 });
    }

    const result = checkBrandCompliance(post.content, brandKit);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
