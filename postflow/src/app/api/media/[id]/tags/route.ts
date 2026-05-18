import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { generateMediaTags } from "@/lib/ai";

const idSchema = z.string().cuid();

// ── POST /api/media/[id]/tags ─────────────────────────────────────────────────

export async function POST(
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.userId !== session.user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const tags = await generateMediaTags(asset.publicUrl);

    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: { tags },
    });

    return NextResponse.json({ tags: updated.tags });
  } catch (err) {
    return handleRouteError(err);
  }
}
