import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CalendarOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BlackoutPeriodsClient } from "./blackout-periods-client";

export default async function BlackoutPeriodsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const periods = await prisma.blackoutPeriod.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isRecurring: true,
      daysOfWeek: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Blackout Periods</h1>
        <p className="text-muted-foreground">
          Define time windows when no posts should be auto-scheduled. The queue
          system will skip these periods when finding the next available slot.
        </p>
      </div>

      <BlackoutPeriodsClient initialPeriods={periods} />

      {periods.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarOff className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No blackout periods defined</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Create a blackout period to prevent auto-scheduling during
              holidays, company events, or any time you don&apos;t want posts
              going out.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
