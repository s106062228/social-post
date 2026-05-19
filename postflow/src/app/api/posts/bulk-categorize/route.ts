import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ContentCategory } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const bulkCategorizeSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(100),
  contentCategory: z.nativeEnum(ContentCategory).nullable(),
});

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkCategorizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postIds, contentCategory } = parsed.data;
    const userId = session.user.id;

    const result = await prisma.post.updateMany({
      where: { id: { in: postIds }, userId },
      data: { contentCategory },
    });

    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return handleRouteError(err);
  }
}
