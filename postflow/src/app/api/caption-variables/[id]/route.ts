import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Key may only contain letters, numbers, and underscores")
    .optional(),
  value: z.string().min(1).max(1000).optional(),
  description: z.string().max(200).optional().nullable(),
});

// ── PATCH /api/caption-variables/[id] ────────────────────────────────────────

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
    const existing = await prisma.captionVariable.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const variable = await prisma.captionVariable.update({
        where: { id },
        data: {
          ...(parsed.data.key !== undefined ? { key: parsed.data.key } : {}),
          ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
        },
        select: {
          id: true,
          key: true,
          value: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ variable });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: `Variable key '${parsed.data.key}' already exists` },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/caption-variables/[id] ───────────────────────────────────────

export async function DELETE(
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
    const existing = await prisma.captionVariable.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.captionVariable.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
