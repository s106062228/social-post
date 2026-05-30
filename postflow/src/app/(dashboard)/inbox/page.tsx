import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [comments, totalUnread] = await Promise.all([
    prisma.socialComment.findMany({
      where: { userId },
      orderBy: { postedAt: "desc" },
      take: 20,
    }),
    prisma.socialComment.count({ where: { userId, isRead: false } }),
  ]);

  // Find last sync time
  const lastSynced = await prisma.socialComment
    .findFirst({ where: { userId }, orderBy: { fetchedAt: "desc" } })
    .then((c) => c?.fetchedAt ?? null);

  return (
    <InboxClient
      initialComments={comments}
      totalUnread={totalUnread}
      lastSynced={lastSynced}
    />
  );
}
