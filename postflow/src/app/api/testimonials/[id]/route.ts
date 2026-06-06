import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const patchSchema = z.object({
  authorName: z.string().min(1).max(200).optional(),
  authorTitle: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  content: z.string().min(1).max(5000).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  sourceUrl: z.string().url().max(2000).optional().nullable(),
  imageUrl: z.string().url().max(2000).optional().nullable(),
  isFeatured: z.boolean().optional(),
});

const select = {
  id: true,
  authorName: true,
  authorTitle: true,
  company: true,
  content: true,
  rating: true,
  sourceUrl: true,
  imageUrl: true,
  isFeatured: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── PATCH /api/testimonials/[id] ──────────────────────────────────────────────

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { id } = await params;

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const item = await prisma.testimonial.update({
      where: { id },
      data: {
        ...(parsed.data.authorName !== undefined && { authorName: parsed.data.authorName }),
        ...(parsed.data.authorTitle !== undefined && { authorTitle: parsed.data.authorTitle }),
        ...(parsed.data.company !== undefined && { company: parsed.data.company }),
        ...(parsed.data.content !== undefined && { content: parsed.data.content }),
        ...(parsed.data.rating !== undefined && { rating: parsed.data.rating }),
        ...(parsed.data.sourceUrl !== undefined && { sourceUrl: parsed.data.sourceUrl }),
        ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl }),
        ...(parsed.data.isFeatured !== undefined && { isFeatured: parsed.data.isFeatured }),
      },
      select,
    });

    return NextResponse.json({ item });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/testimonials/[id] ─────────────────────────────────────────────

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

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.testimonial.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
