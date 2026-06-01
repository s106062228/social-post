import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CalendarView } from "@/components/calendar-view";
import { CalendarExport } from "@/components/calendar-export";
import { CalendarPlannerDialog } from "@/components/calendar-planner-dialog";
import { Plus, StickyNote, Share2, Upload } from "lucide-react";

export default async function CalendarPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [posts, notes] = await Promise.all([
    prisma.post.findMany({
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
    }),
    prisma.calendarNote.findMany({
      where: { userId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        title: true,
        body: true,
        color: true,
      },
    }),
  ]);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/calendar-notes">
              <StickyNote className="mr-2 h-4 w-4" />
              Day Notes
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/calendar-shares">
              <Share2 className="mr-2 h-4 w-4" />
              Share Calendar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/calendar/import">
              <Upload className="mr-2 h-4 w-4" />
              Import ICS
            </Link>
          </Button>
          <CalendarExport />
          <CalendarPlannerDialog />
          <Button asChild>
            <Link href="/posts/new">
              <Plus className="mr-2 h-4 w-4" />
              New post
            </Link>
          </Button>
        </div>
      </div>

      <CalendarView posts={calendarPosts} notes={notes} />
    </div>
  );
}
