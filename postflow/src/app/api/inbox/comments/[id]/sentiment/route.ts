import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const bodySchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const comment = await prisma.socialComment.findFirst({
      where: { id, userId },
    });
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const updated = await prisma.socialComment.update({
      where: { id },
      data: { sentiment: body.sentiment, sentimentScore: 1.0 },
    });

    return NextResponse.json({
      sentiment: updated.sentiment,
      sentimentScore: updated.sentimentScore,
    });
  } catch (err) {
    console.error("patch comment sentiment error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
