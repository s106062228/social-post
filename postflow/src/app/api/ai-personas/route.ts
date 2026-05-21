import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PERSONAS = 10;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  writingStyle: z.string().min(1).max(500),
  tone: z.string().min(1).max(100),
  audienceDescription: z.string().max(300).optional().nullable(),
  exampleContent: z.string().max(1000).optional().nullable(),
});

// ── GET /api/ai-personas ──────────────────────────────────────────────────────

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

    const personas = await prisma.aiPersona.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        writingStyle: true,
        tone: true,
        audienceDescription: true,
        exampleContent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ personas });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/ai-personas ─────────────────────────────────────────────────────

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

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.aiPersona.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PERSONAS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PERSONAS} personas allowed` },
        { status: 422 }
      );
    }

    const persona = await prisma.aiPersona.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        writingStyle: parsed.data.writingStyle,
        tone: parsed.data.tone,
        audienceDescription: parsed.data.audienceDescription ?? null,
        exampleContent: parsed.data.exampleContent ?? null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        writingStyle: true,
        tone: true,
        audienceDescription: true,
        exampleContent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ persona }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
