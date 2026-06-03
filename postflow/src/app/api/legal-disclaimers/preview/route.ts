import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const CUID_RE = /^c[a-z0-9]{20,}$/i;

const previewSchema = z.object({
  content: z.string().min(1).max(10000),
  disclaimerId: z.string(),
});

// ── POST /api/legal-disclaimers/preview ──────────────────────────────────────

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

    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, disclaimerId } = parsed.data;

    if (!CUID_RE.test(disclaimerId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const disclaimer = await prisma.legalDisclaimer.findUnique({
      where: { id: disclaimerId },
    });
    if (!disclaimer || disclaimer.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let preview: string;
    if (disclaimer.position === "prepend") {
      preview = `${disclaimer.content}\n\n${content}`;
    } else {
      preview = `${content}\n\n${disclaimer.content}`;
    }

    return NextResponse.json({ preview });
  } catch (err) {
    return handleRouteError(err);
  }
}
