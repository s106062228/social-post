import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Send,
  RefreshCw,
  Copy,
  Activity,
} from "lucide-react";
import type { ActivityLog } from "@prisma/client";

const PAGE_SIZE = 30;

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "post.created": "Created a post",
    "post.updated": "Updated a post",
    "post.deleted": "Deleted a post",
    "post.published": "Published a post",
    "post.retried": "Retried publishing a post",
    "post.duplicated": "Duplicated a post",
    "template.created": "Created a template",
    "template.deleted": "Deleted a template",
    "schedule.created": "Created a recurring schedule",
    "schedule.deleted": "Deleted a recurring schedule",
    "schedule.toggled": "Toggled a recurring schedule",
    "account.connected": "Connected a social account",
    "account.disconnected": "Disconnected a social account",
  };
  return labels[action] ?? action;
}

function ActionIcon({ action }: { action: string }) {
  const iconClass = "h-4 w-4";
  if (action === "post.created" || action === "template.created" || action === "schedule.created")
    return <PlusCircle className={iconClass} />;
  if (action === "post.updated")
    return <Pencil className={iconClass} />;
  if (action === "post.deleted" || action === "template.deleted" || action === "schedule.deleted")
    return <Trash2 className={iconClass} />;
  if (action === "post.published")
    return <Send className={iconClass} />;
  if (action === "post.retried")
    return <RefreshCw className={iconClass} />;
  if (action === "post.duplicated")
    return <Copy className={iconClass} />;
  return <Activity className={iconClass} />;
}

function iconBg(action: string): string {
  if (action.endsWith(".deleted")) return "bg-red-100 text-red-600";
  if (action === "post.published") return "bg-green-100 text-green-600";
  if (action === "post.retried") return "bg-yellow-100 text-yellow-700";
  if (action.endsWith(".created") || action === "post.duplicated")
    return "bg-blue-100 text-blue-600";
  return "bg-gray-100 text-gray-600";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ActivityPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const logs = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">
          A timeline of recent actions across your PostFlow account
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Showing the last {PAGE_SIZE} actions</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              <p className="text-xs text-muted-foreground">
                Actions like creating or publishing posts will appear here.
              </p>
            </div>
          ) : (
            <ol className="relative border-l border-muted">
              {logs.map((log: ActivityLog) => (
                <li key={log.id} className="mb-6 ml-6 last:mb-0">
                  <span
                    className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-background ${iconBg(log.action)}`}
                  >
                    <ActionIcon action={log.action} />
                  </span>
                  <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{actionLabel(log.action)}</p>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </time>
                    </div>
                    {log.entityId && (
                      <p className="text-xs text-muted-foreground">
                        {log.entityType ?? "entity"} <code className="font-mono">{log.entityId}</code>
                      </p>
                    )}
                    {log.metadata !== null && typeof log.metadata === "object" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          Details
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
