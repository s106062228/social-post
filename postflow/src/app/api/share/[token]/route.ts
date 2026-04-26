import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── GET /api/share/[token] (public — no auth required) ────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            mediaType: true,
            mediaUrls: true,
            status: true,
            scheduledAt: true,
            createdAt: true,
            publishResults: {
              select: {
                platform: true,
                status: true,
                publishedUrl: true,
                publishedAt: true,
              },
            },
          },
        },
      },
    });

    if (!shareLink) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
    }

    await prisma.shareLink.update({
      where: { token },
      data: { views: { increment: 1 } },
    });

    return NextResponse.json({
      post: shareLink.post,
      views: shareLink.views + 1,
      expiresAt: shareLink.expiresAt,
      createdAt: shareLink.createdAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
