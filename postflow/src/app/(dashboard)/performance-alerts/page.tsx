import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing } from "lucide-react";
import { CreatePerformanceAlertForm } from "./create-performance-alert-form";
import { PerformanceAlertRow } from "./performance-alert-row";

export default async function PerformanceAlertsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const alerts = await prisma.performanceAlert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      metric: true,
      operator: true,
      threshold: true,
      platform: true,
      period: true,
      isActive: true,
      lastTriggeredAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance Alerts</h1>
        <p className="text-muted-foreground">
          Get notified when your post engagement metrics cross a threshold.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New alert</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePerformanceAlertForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BellRing className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No performance alerts yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first alert above to start monitoring your engagement metrics.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <PerformanceAlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
