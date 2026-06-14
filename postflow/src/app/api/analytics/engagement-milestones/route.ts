import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success)
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );

  const period = request.nextUrl.searchParams.get("period") ?? "30d";
  const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const milestones = await prisma.postEngagementMilestone.findMany({
    where: {
      userId: session.user.id,
      achievedAt: { gte: from },
    },
    include: {
      post: { select: { id: true, content: true } },
    },
    orderBy: { achievedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ milestones });
}
