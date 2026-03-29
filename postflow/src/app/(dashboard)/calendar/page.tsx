import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CalendarView } from "@/components/calendar-view";
import { Plus } from "lucide-react";

export default async function CalendarPage() {
  const session = await auth();
  const userId = session!.user!.id;

  // Fetch scheduled posts for calendar view
  const posts = await prisma.post.findMany({
    where: {
      userId,
      status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
      scheduledAt: { not: null },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      content: true,
      scheduledAt: true,
      status: true,
    },
  });

  const calendarPosts = posts
    .filter((p) => p.scheduledAt !== null)
    .map((p) => ({
      id: p.id,
      content: p.content,
      scheduledAt: p.scheduledAt!.toISOString(),
      status: p.status,
    }));

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            View and manage your scheduled posts.
          </p>
        </div>
        <Button asChild>
          <Link href="/posts/new">
            <Plus className="mr-2 h-4 w-4" />
            New post
          </Link>
        </Button>
      </div>

      <CalendarView posts={calendarPosts} />
    </div>
  );
}
