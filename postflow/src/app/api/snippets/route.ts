import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_SNIPPETS = 50;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  category: z.string().max(50).optional().nullable(),
});

// ── GET /api/snippets ─────────────────────────────────────────────────────────

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

    const snippets = await prisma.contentSnippet.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        content: true,
        category: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ snippets });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/snippets ────────────────────────────────────────────────────────

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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.contentSnippet.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SNIPPETS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SNIPPETS} snippets allowed` },
        { status: 422 }
      );
    }

    const snippet = await prisma.contentSnippet.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        content: parsed.data.content,
        category: parsed.data.category ?? null,
      },
      select: {
        id: true,
        name: true,
        content: true,
        category: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ snippet }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
