import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Webhook } from "lucide-react";
import { WebhooksClient } from "./webhooks-client";

export default async function WebhooksPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const configs = await prisma.webhookConfig.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground">
          Receive signed HTTP POST notifications when posts are published or fail.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Webhook className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No webhooks configured</p>
              <p className="text-xs text-muted-foreground">
                Add a webhook endpoint below to start receiving event notifications.
              </p>
            </div>
          ) : null}
          <WebhooksClient initialConfigs={configs} />
        </CardContent>
      </Card>
    </div>
  );
}
