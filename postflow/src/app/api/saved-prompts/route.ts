import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_SAVED_PROMPTS = 50;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  prompt: z.string().min(1).max(5000),
  category: z.string().max(50).optional().nullable(),
  isPublic: z.boolean().optional().default(false),
});

// ── GET /api/saved-prompts ────────────────────────────────────────────────────

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

    const prompts = await prisma.savedPrompt.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        prompt: true,
        category: true,
        isPublic: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ prompts });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/saved-prompts ───────────────────────────────────────────────────

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

    const count = await prisma.savedPrompt.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SAVED_PROMPTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SAVED_PROMPTS} saved prompts allowed` },
        { status: 422 }
      );
    }

    const savedPrompt = await prisma.savedPrompt.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        prompt: parsed.data.prompt,
        category: parsed.data.category ?? null,
        isPublic: parsed.data.isPublic ?? false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        prompt: true,
        category: true,
        isPublic: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ savedPrompt }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
