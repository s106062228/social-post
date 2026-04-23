import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { QueuePageClient } from "./queue-client";
import { previewUpcomingSlots } from "@/lib/queue-slots";
import type { Platform } from "@prisma/client";

export const metadata = { title: "Posting Queue — PostFlow" };

interface SlotRow {
  id: string;
  label: string;
  platform: Platform | null;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  isActive: boolean;
}

export default async function QueuePage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [user, rawSlots] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.postQueueSlot.findMany({
      where: { userId },
      orderBy: [{ hour: "asc" }, { minute: "asc" }],
      select: {
        id: true,
        label: true,
        platform: true,
        hour: true,
        minute: true,
        daysOfWeek: true,
        isActive: true,
      },
    }),
  ]);

  const timezone = user?.timezone ?? "UTC";

  const upcoming = previewUpcomingSlots(rawSlots as SlotRow[], timezone, 7);

  return (
    <QueuePageClient
      initialSlots={rawSlots as SlotRow[]}
      upcomingSlots={upcoming.map((d) => d.toISOString())}
      timezone={timezone}
    />
  );
}
