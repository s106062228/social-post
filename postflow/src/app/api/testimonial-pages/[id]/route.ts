import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  title: z.string().min(1).max(200).optional(),
  welcomeMessage: z.string().max(2000).optional().nullable(),
  thankYouMessage: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

const select = {
  id: true,
  slug: true,
  title: true,
  welcomeMessage: true,
  thankYouMessage: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── PATCH /api/testimonial-pages/[id] ─────────────────────────────────────────

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

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { id } = await params;

    const existing = await prisma.testimonialPage.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.testimonialPage.findUnique({
        where: { slug: parsed.data.slug },
      });
      if (slugTaken) {
        return NextResponse.json({ error: "Slug is already taken" }, { status: 409 });
      }
    }

    const page = await prisma.testimonialPage.update({
      where: { id },
      data: {
        ...(parsed.data.slug !== undefined && { slug: parsed.data.slug }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.welcomeMessage !== undefined && {
          welcomeMessage: parsed.data.welcomeMessage,
        }),
        ...(parsed.data.thankYouMessage !== undefined && {
          thankYouMessage: parsed.data.thankYouMessage,
        }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
      select,
    });

    return NextResponse.json({ page });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/testimonial-pages/[id] ────────────────────────────────────────

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

    const existing = await prisma.testimonialPage.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.testimonialPage.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
