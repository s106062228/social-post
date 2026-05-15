import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface DigestScanJobData {
  triggeredAt: string;
}

// ── HTML template ──────────────────────────────────────────────────────────────

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function buildDigestEmail(
  notificationCount: number,
  items: { title: string; body: string; createdAt: Date }[]
): string {
  const rows = items
    .slice(0, 20)
    .map(
      (n) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
          <p style="margin:0;font-weight:600;color:#111">${n.title}</p>
          <p style="margin:4px 0 0;color:#555;font-size:14px">${n.body}</p>
          <p style="margin:4px 0 0;color:#999;font-size:12px">${n.createdAt.toLocaleDateString()}</p>
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2563eb">📋 Your Weekly PostFlow Digest</h2>
  <p>You have <strong>${notificationCount}</strong> unread notification${notificationCount === 1 ? "" : "s"} from the past week.</p>
  <table style="width:100%;border-collapse:collapse">
    ${rows}
  </table>
  <p style="margin-top:24px">
    <a href="${appUrl()}/activity" style="color:#2563eb">View all activity →</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#999">
    This weekly digest is sent every Monday.<br>
    Manage notification preferences at <a href="${appUrl()}/settings">${appUrl()}/settings</a>.
  </p>
</body>
</html>`;
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createDigestWorker(): Worker<DigestScanJobData> {
  return new Worker<DigestScanJobData>(
    QUEUE_NAMES.NOTIFICATION_DIGEST,
    async (job: Job<DigestScanJobData>) => {
      workerLogger.info({ jobId: job.id }, "Digest scan started");

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find users who have email notifications enabled and unread notifications in the past week
      const usersWithUnread = await prisma.user.findMany({
        where: {
          emailNotifications: true,
          notifications: {
            some: {
              read: false,
              createdAt: { gte: since },
            },
          },
        },
        select: {
          id: true,
          email: true,
          notifications: {
            where: {
              read: false,
              createdAt: { gte: since },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { title: true, body: true, createdAt: true },
          },
        },
      });

      let sent = 0;
      let skipped = 0;

      for (const user of usersWithUnread) {
        const count = user.notifications.length;
        if (count === 0) {
          skipped++;
          continue;
        }

        // Check if user has opted out of digest emails specifically
        const digestPref = await prisma.notificationPreference.findUnique({
          where: {
            userId_notificationType: {
              userId: user.id,
              notificationType: "digest.weekly",
            },
          },
          select: { email: true },
        });

        if (digestPref?.email === false) {
          skipped++;
          continue;
        }

        const html = buildDigestEmail(count, user.notifications);
        const ok = await sendEmail({
          to: user.email,
          subject: `[PostFlow] Weekly digest — ${count} unread notification${count === 1 ? "" : "s"}`,
          html,
        });

        if (ok) sent++;
      }

      workerLogger.info(
        { sent, skipped, total: usersWithUnread.length },
        "Digest scan complete"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
