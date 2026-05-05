import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const putSchema = z.object({
  content: z.string().max(65000),
  scheduledAt: z.string().datetime().optional().nullable(),
  firstComment: z.string().max(2200).optional().nullable(),
  selectedAccountIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  platformVariants: z.array(z.unknown()).optional().nullable(),
});

// ── GET /api/posts/autosave ───────────────────────────────────────────────────

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

    const draft = await prisma.draftAutosave.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        firstComment: true,
        selectedAccountIds: true,
        tagIds: true,
        platformVariants: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ draft: draft ?? null });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/autosave ───────────────────────────────────────────────────

export async function PUT(request: NextRequest): Promise<NextResponse> {
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
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { content, scheduledAt, firstComment, selectedAccountIds, tagIds, platformVariants } =
      parsed.data;

    const draft = await prisma.draftAutosave.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        content,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        firstComment: firstComment ?? null,
        selectedAccountIds: selectedAccountIds ?? [],
        tagIds: tagIds ?? [],
        platformVariants: platformVariants ?? undefined,
      },
      update: {
        content,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        firstComment: firstComment ?? null,
        selectedAccountIds: selectedAccountIds ?? [],
        tagIds: tagIds ?? [],
        platformVariants: platformVariants ?? undefined,
      },
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        firstComment: true,
        selectedAccountIds: true,
        tagIds: true,
        platformVariants: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ draft });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/posts/autosave ────────────────────────────────────────────────

export async function DELETE(): Promise<NextResponse> {
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

    await prisma.draftAutosave.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
