import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [slackIntegrations, discordIntegrations] = await Promise.all([
    prisma.slackIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workspaceName: true,
        webhookUrl: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.discordIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        channelName: true,
        webhookUrl: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Receive notifications in Slack or Discord when posts are published,
          fail, or partially publish.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Slack & Discord
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationsClient
            initialSlack={slackIntegrations}
            initialDiscord={discordIntegrations}
          />
        </CardContent>
      </Card>
    </div>
  );
}
