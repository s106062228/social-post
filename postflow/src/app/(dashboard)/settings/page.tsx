import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./settings-form";
import { TwoFactorSettings } from "./two-factor-settings";

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
      totpEnabled: true,
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
      </div>
    </div>
  );
}
