import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  allComplete: boolean;
  dismissed: boolean;
}

// ── GET /api/onboarding/status ────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const userId = session.user.id;

    const [user, accountCount, postCount, publishedCount, queueSlotCount] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { onboardingDismissed: true },
        }),
        prisma.socialAccount.count({ where: { userId, isActive: true } }),
        prisma.post.count({ where: { userId } }),
        prisma.publishResult.count({
          where: { post: { userId }, status: "PUBLISHED" },
        }),
        prisma.postQueueSlot.count({ where: { userId } }),
      ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const steps: OnboardingStep[] = [
      {
        id: "connect-account",
        label: "Connect a social account",
        description: "Link your Facebook, Instagram, or Threads account.",
        href: "/accounts",
        completed: accountCount > 0,
      },
      {
        id: "create-post",
        label: "Create your first post",
        description: "Write and save a draft post to get started.",
        href: "/posts/new",
        completed: postCount > 0,
      },
      {
        id: "publish-post",
        label: "Publish a post",
        description: "Publish or schedule a post to your social accounts.",
        href: "/posts",
        completed: publishedCount > 0,
      },
      {
        id: "set-up-queue",
        label: "Set up your posting queue",
        description: "Configure preferred time slots for automatic scheduling.",
        href: "/queue",
        completed: queueSlotCount > 0,
      },
    ];

    const allComplete = steps.every((s) => s.completed);

    const status: OnboardingStatus = {
      steps,
      allComplete,
      dismissed: user.onboardingDismissed,
    };

    return NextResponse.json(status);
  } catch (err) {
    return handleRouteError(err);
  }
}
