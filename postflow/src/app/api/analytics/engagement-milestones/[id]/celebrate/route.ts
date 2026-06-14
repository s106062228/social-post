import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success)
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );

  const { id } = await params;

  const milestone = await prisma.postEngagementMilestone.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!milestone)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.postEngagementMilestone.update({
    where: { id },
    data: { celebrated: true },
  });

  return NextResponse.json({ celebrated: true });
}
