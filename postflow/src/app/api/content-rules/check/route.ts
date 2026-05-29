import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { checkContentRules } from "@/lib/content-rules";

const checkSchema = z.object({
  content: z.string().min(1).max(10000),
  platform: z.string().optional(),
});

// ── POST /api/content-rules/check ────────────────────────────────────────────

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

    const parsed = checkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const rules = await prisma.contentRule.findMany({
      where: { userId: session.user.id, isActive: true },
    });

    const result = checkContentRules(
      parsed.data.content,
      rules as Parameters<typeof checkContentRules>[1],
      parsed.data.platform
    );

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
