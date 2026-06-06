import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const patchSchema = z.object({
  postId: z.string().min(1).max(100).optional().nullable(),
  platform: z.nativeEnum(Platform).optional(),
  campaignName: z.string().min(1).max(200).optional(),
  budget: z.number().min(0).max(10_000_000).optional(),
  spend: z.number().min(0).max(10_000_000).optional(),
  currency: z.string().min(1).max(10).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional().nullable(),
  goal: z.string().max(200).optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  impressions: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  clicks: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  conversions: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const select = {
  id: true,
  postId: true,
  platform: true,
  campaignName: true,
  budget: true,
  spend: true,
  currency: true,
  startDate: true,
  endDate: true,
  goal: true,
  status: true,
  impressions: true,
  clicks: true,
  conversions: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  post: { select: { id: true, content: true } },
} as const;

// ── PATCH /api/promotions/[id] ────────────────────────────────────────────────

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

    const existing = await prisma.postPromotion.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = parsed.data;

    if (data.postId) {
      const post = await prisma.post.findUnique({ where: { id: data.postId } });
      if (!post || post.userId !== session.user.id) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
    }

    const item = await prisma.postPromotion.update({
      where: { id },
      data: {
        ...(data.postId !== undefined && { postId: data.postId }),
        ...(data.platform !== undefined && { platform: data.platform }),
        ...(data.campaignName !== undefined && { campaignName: data.campaignName }),
        ...(data.budget !== undefined && { budget: data.budget }),
        ...(data.spend !== undefined && { spend: data.spend }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate ? new Date(data.endDate) : null,
        }),
        ...(data.goal !== undefined && { goal: data.goal }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.impressions !== undefined && { impressions: data.impressions }),
        ...(data.clicks !== undefined && { clicks: data.clicks }),
        ...(data.conversions !== undefined && { conversions: data.conversions }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      select,
    });

    return NextResponse.json({ item });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/promotions/[id] ───────────────────────────────────────────────

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

    const existing = await prisma.postPromotion.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.postPromotion.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
