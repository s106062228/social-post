import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { deleteMedia } from "@/lib/platforms/media";

const idSchema = z.string().cuid();

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
