import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  writingStyle: z.string().min(1).max(500).optional(),
  tone: z.string().min(1).max(100).optional(),
  audienceDescription: z.string().max(300).optional().nullable(),
  exampleContent: z.string().max(1000).optional().nullable(),
});

// ── PATCH /api/ai-personas/[id] ───────────────────────────────────────────────

export async function PATCH(
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

    const existing = await prisma.aiPersona.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const persona = await prisma.aiPersona.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.writingStyle !== undefined && { writingStyle: parsed.data.writingStyle }),
        ...(parsed.data.tone !== undefined && { tone: parsed.data.tone }),
        ...(parsed.data.audienceDescription !== undefined && {
          audienceDescription: parsed.data.audienceDescription,
        }),
        ...(parsed.data.exampleContent !== undefined && {
          exampleContent: parsed.data.exampleContent,
        }),
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

    return NextResponse.json({ persona });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/ai-personas/[id] ──────────────────────────────────────────────

export async function DELETE(
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

    const existing = await prisma.aiPersona.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.aiPersona.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
