import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const sponsorBodySchema = z.object({
  isSponsored: z.boolean(),
  sponsorName: z.string().max(200).optional(),
  disclosureText: z.string().max(500).optional(),
});

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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = sponsorBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { isSponsored, sponsorName, disclosureText } = parsed.data;

    // When marking as sponsored, require at least a name or disclosure text
    if (isSponsored && !sponsorName && !disclosureText) {
      return NextResponse.json(
        { error: "Sponsored posts require either a sponsor name or disclosure text" },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        isSponsored,
        sponsorName: isSponsored ? (sponsorName ?? null) : null,
        disclosureText: isSponsored ? (disclosureText ?? null) : null,
      },
      select: { isSponsored: true, sponsorName: true, disclosureText: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
