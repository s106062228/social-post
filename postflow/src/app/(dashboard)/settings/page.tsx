import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./settings-form";
import { TwoFactorSettings } from "./two-factor-settings";
import { PublishingControls } from "./publishing-controls";
import { DataExportSection } from "./data-export-section";
import { PushNotificationSetup } from "@/components/push-notification-setup";
import { NotificationPreferences } from "@/components/notification-preferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      emailNotifications: true,
      theme: true,
      totpEnabled: true,
      publishingPaused: true,
      publishingPausedReason: true,
      publishingPausedAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="max-w-2xl flex flex-col gap-8">
        <SettingsForm user={user} />
        <TwoFactorSettings totpEnabled={user.totpEnabled} />
        <Card>
          <CardHeader>
            <CardTitle>Browser Notifications</CardTitle>
            <CardDescription>
              Receive instant push notifications in this browser when posts are published, fail, or
              are partially published.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushNotificationSetup />
          </CardContent>
        </Card>
        <NotificationPreferences />
        <PublishingControls
          initialPaused={user.publishingPaused}
          initialReason={user.publishingPausedReason ?? null}
          initialPausedAt={user.publishingPausedAt ?? null}
        />
        <DataExportSection userEmail={user.email} />
      </div>
    </div>
  );
}
