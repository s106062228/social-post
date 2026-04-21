import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RepeatIcon } from "lucide-react";
import { DeleteScheduleButton } from "./delete-schedule-button";
import { ToggleScheduleButton } from "./toggle-schedule-button";
import { CreateScheduleForm } from "./create-schedule-form";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const [schedules, total] = await Promise.all([
    prisma.recurringSchedule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.recurringSchedule.count({ where: { userId } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  function buildHref(p: number) {
    return `/schedules${p > 1 ? `?page=${p}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recurring Schedules</h1>
          <p className="text-muted-foreground">
            Automatically create and publish posts on a repeating schedule.
          </p>
        </div>
        <CreateScheduleForm />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {total} schedule{total !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <RepeatIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No recurring schedules yet</p>
              <p className="text-xs text-muted-foreground">
                Create a schedule to automatically post content on a recurring basis.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{schedule.name}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          schedule.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {schedule.isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {schedule.content}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{schedule.cronExpr}</span>
                      <span>·</span>
                      <span>{schedule.timezone}</span>
                      <span>·</span>
                      <span>{schedule.platforms.join(", ")}</span>
                      {schedule.nextRunAt && (
                        <>
                          <span>·</span>
                          <span>
                            Next: {new Date(schedule.nextRunAt).toLocaleString()}
                          </span>
                        </>
                      )}
                      {schedule.lastRunAt && (
                        <>
                          <span>·</span>
                          <span>
                            Last ran: {new Date(schedule.lastRunAt).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ToggleScheduleButton
                      scheduleId={schedule.id}
                      isActive={schedule.isActive}
                    />
                    <DeleteScheduleButton scheduleId={schedule.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page + 1)}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
