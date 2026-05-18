import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { deleteMedia } from "@/lib/platforms/media";

const idSchema = z.string().cuid();

const patchSchema = z.object({
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

// ── PATCH /api/media/[id] ─────────────────────────────────────────────────────

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
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.userId !== session.user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.tags !== undefined && { tags: parsed.data.tags }),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/media/[id] ────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.userId !== session.user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Remove from R2 first; if this fails, we keep the DB record intact so
    // the user can retry. Swallow R2 errors to avoid blocking the response
    // when the key is already gone (e.g. manual cleanup).
    try {
      await deleteMedia(asset.r2Key);
    } catch {
      // R2 deletion failure is non-fatal — record is still removed from DB
    }

    await prisma.mediaAsset.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
