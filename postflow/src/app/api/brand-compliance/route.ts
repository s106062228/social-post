import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { checkBrandCompliance } from "@/lib/brand-compliance";

const bodySchema = z.object({
  content: z.string().min(1).max(65536),
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

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const brandKit = await prisma.brandKit.findUnique({
      where: { userId: session.user.id },
      select: { doKeywords: true, dontKeywords: true },
    });

    if (!brandKit) {
      return NextResponse.json({ violations: [], compliant: true, score: 100 });
    }

    const result = checkBrandCompliance(parsed.data.content, brandKit);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
