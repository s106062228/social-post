import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<string, string> = {
  [PostStatus.SCHEDULED]: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  [PostStatus.PUBLISHED]: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

// Deterministic color palette for up to 10 members
const AUTHOR_COLORS = [
  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 border-sky-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 border-pink-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-300",
];

export default async function TeamCalendarPage({ params, searchParams }: Props) {
  const { id: teamId } = await params;
  const { year: yearParam, month: monthParam } = await searchParams;

  const session = await auth();
  const userId = session!.user!.id;

  // Verify team membership
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: { team: { select: { id: true, name: true } } },
  });
  if (!membership) notFound();

  const now = new Date();
  const year = parseInt(yearParam ?? String(now.getFullYear()), 10);
  const month = parseInt(monthParam ?? String(now.getMonth() + 1), 10);

  const safeYear = isNaN(year) ? now.getFullYear() : year;
  const safeMonth = isNaN(month) || month < 1 || month > 12 ? now.getMonth() + 1 : month;

  // Date range for the month
  const startDate = new Date(safeYear, safeMonth - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(safeYear, safeMonth, 0, 23, 59, 59, 999);

  // Get all members
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const memberUserIds = members.map((m) => m.userId);

  // Build author color map (stable order)
  const authorColorMap = new Map(
    members.map((m, i) => [m.userId, AUTHOR_COLORS[i % AUTHOR_COLORS.length]])
  );
  const authorNameMap = new Map(
    members.map((m) => [m.userId, m.user.name ?? m.user.email ?? "Unknown"])
  );

  // Fetch posts from all team members
  const posts = await prisma.post.findMany({
    where: {
      userId: { in: memberUserIds },
      status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
      scheduledAt: { gte: startDate, lte: endDate },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      content: true,
      scheduledAt: true,
      status: true,
      userId: true,
      publishResults: {
        select: { platform: true },
        distinct: ["platform"],
      },
    },
  });

  // Group posts by day
  const postsByDay = new Map<number, typeof posts>();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const day = new Date(post.scheduledAt).getDate();
    const dayPosts = postsByDay.get(day) ?? [];
    dayPosts.push(post);
    postsByDay.set(day, dayPosts);
  }

  const daysInMonth = getDaysInMonth(safeYear, safeMonth - 1);
  const firstDay = getFirstDayOfMonth(safeYear, safeMonth - 1);

  // Prev/next month links
  const prevYear = safeMonth === 1 ? safeYear - 1 : safeYear;
  const prevMonth = safeMonth === 1 ? 12 : safeMonth - 1;
  const nextYear = safeMonth === 12 ? safeYear + 1 : safeYear;
  const nextMonth = safeMonth === 12 ? 1 : safeMonth + 1;

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/teams/${teamId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Team
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {membership.team.name} — Shared Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Scheduled and published posts from all team members.
          </p>
        </div>
      </div>

      {/* Member legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground font-medium">Members:</span>
        {members.map((m) => (
          <Badge
            key={m.userId}
            className={`${authorColorMap.get(m.userId) ?? ""} border`}
            variant="outline"
          >
            {m.user.name ?? m.user.email ?? "Unknown"}
            {m.userId === userId ? " (you)" : ""}
          </Badge>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/teams/${teamId}/calendar?year=${prevYear}&month=${prevMonth}`}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Link>
        </Button>
        <h2 className="text-xl font-semibold">
          {MONTH_NAMES[safeMonth - 1]} {safeYear}
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/teams/${teamId}/calendar?year=${nextYear}&month=${nextMonth}`}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-sm font-medium text-muted-foreground bg-muted/30"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-24 border-r border-b bg-muted/10" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayPosts = postsByDay.get(day) ?? [];
            const isToday =
              safeYear === now.getFullYear() &&
              safeMonth === now.getMonth() + 1 &&
              day === now.getDate();

            return (
              <div
                key={day}
                className={`min-h-24 border-r border-b p-1 ${isToday ? "bg-primary/5" : ""}`}
              >
                <div
                  className={`text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {day}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayPosts.slice(0, 3).map((post) => {
                    const time = post.scheduledAt
                      ? new Date(post.scheduledAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";
                    const authorColor = authorColorMap.get(post.userId) ?? AUTHOR_COLORS[0];
                    const authorName = authorNameMap.get(post.userId) ?? "Unknown";
                    return (
                      <div
                        key={post.id}
                        className={`text-xs rounded px-1 py-0.5 truncate border ${authorColor}`}
                        title={`${authorName}: ${post.content.slice(0, 100)}`}
                      >
                        <span className="font-medium">{time}</span>{" "}
                        <span className="opacity-75">{authorName.split(" ")[0]}</span>{" "}
                        {post.content.slice(0, 20)}
                        {post.content.length > 20 ? "…" : ""}
                      </div>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <div className="text-xs text-muted-foreground text-center">
                      +{dayPosts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Trailing empty cells to complete last row */}
          {(() => {
            const total = firstDay + daysInMonth;
            const remainder = total % 7;
            const trailing = remainder === 0 ? 0 : 7 - remainder;
            return Array.from({ length: trailing }).map((_, i) => (
              <div key={`trailing-${i}`} className="min-h-24 border-r border-b bg-muted/10" />
            ));
          })()}
        </div>
      </div>

      {/* Post count summary */}
      <p className="text-sm text-muted-foreground">
        {posts.length} post{posts.length !== 1 ? "s" : ""} scheduled or published this month
        across {members.length} team member{members.length !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}
