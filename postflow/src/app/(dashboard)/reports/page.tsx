import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { CreateReportScheduleForm } from "./create-report-schedule-form";
import { ReportScheduleRow } from "./report-schedule-row";

export default async function ReportsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const schedules = await prisma.reportSchedule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      frequency: true,
      recipientEmail: true,
      isActive: true,
      lastSentAt: true,
      nextSendAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics Reports</h1>
        <p className="text-muted-foreground">
          Schedule automated analytics reports delivered to your email.
        </p>
      </div>

      {/* Create form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New report schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateReportScheduleForm />
        </CardContent>
      </Card>

      {/* Schedules list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Mail className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No report schedules yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first schedule above to start receiving analytics reports.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {schedules.map((schedule) => (
                <ReportScheduleRow key={schedule.id} schedule={schedule} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
