import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLogger } from "@/lib/logger";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(): Promise<NextResponse> {
  try {
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

    // Upsert: create token row if it doesn't exist yet
    const record = await prisma.feedToken.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { token: true, createdAt: true },
    });

    return NextResponse.json(record, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    apiLogger.error({ error }, "feed token GET error");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
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

    // Delete existing token and create a fresh one (regenerate)
    await prisma.feedToken.deleteMany({ where: { userId } });
    const record = await prisma.feedToken.create({
      data: { userId },
      select: { token: true, createdAt: true },
    });

    return NextResponse.json(record, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    apiLogger.error({ error }, "feed token DELETE error");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
