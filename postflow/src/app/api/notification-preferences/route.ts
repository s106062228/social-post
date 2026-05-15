import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications";

// All known notification types with human-readable labels
const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  "post.published": "Post Published",
  "post.failed": "Post Failed",
  "post.partially_published": "Post Partially Published",
  "post.approval_requested": "Approval Requested",
  "post.approved": "Post Approved",
  "post.rejected": "Post Rejected",
  "post.reminder": "Post Reminder",
  "post.expired": "Post Expired",
};

const ALL_TYPES = Object.values(NOTIFICATION_TYPES);

const patchSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.enum(ALL_TYPES as [NotificationType, ...NotificationType[]]),
        inApp: z.boolean(),
        email: z.boolean(),
      })
    )
    .min(1)
    .max(ALL_TYPES.length),
});

// ── GET /api/notification-preferences ─────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    type PrefRow = { notificationType: string; inApp: boolean; email: boolean };
    const stored: PrefRow[] = await prisma.notificationPreference.findMany({
      where: { userId: session.user.id },
      select: { notificationType: true, inApp: true, email: true },
    });

    const storedMap = new Map<string, PrefRow>(
      stored.map((p) => [p.notificationType, p])
    );

    // Return all types, filling defaults for any without a stored row
    const preferences = ALL_TYPES.map((type) => {
      const row = storedMap.get(type);
      return {
        type,
        label: NOTIFICATION_TYPE_LABELS[type],
        inApp: row?.inApp ?? true,
        email: row?.email ?? true,
      };
    });

    return NextResponse.json({ preferences });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/notification-preferences ───────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { preferences } = parsed.data;
    const userId = session.user.id;

    type PrefInput = { type: NotificationType; inApp: boolean; email: boolean };
    // Upsert each preference
    await Promise.all(
      (preferences as PrefInput[]).map((pref) =>
        prisma.notificationPreference.upsert({
          where: {
            userId_notificationType: {
              userId,
              notificationType: pref.type,
            },
          },
          create: {
            userId,
            notificationType: pref.type,
            inApp: pref.inApp,
            email: pref.email,
          },
          update: {
            inApp: pref.inApp,
            email: pref.email,
          },
        })
      )
    );

    // Return the full updated list
    type PrefRow2 = { notificationType: string; inApp: boolean; email: boolean };
    const stored: PrefRow2[] = await prisma.notificationPreference.findMany({
      where: { userId },
      select: { notificationType: true, inApp: true, email: true },
    });

    const storedMap = new Map<string, PrefRow2>(
      stored.map((p) => [p.notificationType, p])
    );
    const result = ALL_TYPES.map((type) => {
      const row = storedMap.get(type);
      return {
        type,
        label: NOTIFICATION_TYPE_LABELS[type],
        inApp: row?.inApp ?? true,
        email: row?.email ?? true,
      };
    });

    return NextResponse.json({ preferences: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
