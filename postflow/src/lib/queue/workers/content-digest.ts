import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import { PostStatus } from "@prisma/client";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface ContentDigestJobData {
  triggeredAt: string;
}

// ── HTML template ──────────────────────────────────────────────────────────────

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

interface DigestPost {
  id: string;
  content: string;
  scheduledAt: Date;
}

function buildContentDigestEmail(
  lookAheadDays: number,
  postsByDay: Map<string, DigestPost[]>,
  includeContent: boolean
): string {
  const dayKeys = Array.from(postsByDay.keys()).sort();

  if (dayKeys.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2563eb">📅 Your Upcoming Content Preview</h2>
  <p>You have no scheduled posts in the next ${lookAheadDays} days.</p>
  <p><a href="${appUrl()}/posts" style="color:#2563eb">Create a post →</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#999">
    Manage this digest at <a href="${appUrl()}/settings">${appUrl()}/settings</a>.
  </p>
</body>
</html>`;
  }

  const daySections = dayKeys
    .map((dateKey) => {
      const posts = postsByDay.get(dateKey) ?? [];
      const postRows = posts
        .map((p) => {
          const timeStr = formatTime(p.scheduledAt);
          const preview = includeContent
            ? `<p style="margin:4px 0 0;color:#555;font-size:14px">${p.content.slice(0, 200)}${p.content.length > 200 ? "…" : ""}</p>`
            : "";
          return `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #f5f5f5">
              <p style="margin:0;font-weight:500;color:#111;font-size:14px">${timeStr}</p>
              ${preview}
            </td>
          </tr>`;
        })
        .join("");

      return `<div style="margin-bottom:20px">
    <h3 style="margin:0 0 8px;color:#1d4ed8;font-size:16px">${dateKey}</h3>
    <p style="margin:0 0 6px;color:#666;font-size:12px">${posts.length} post${posts.length === 1 ? "" : "s"} scheduled</p>
    <table style="width:100%;border-collapse:collapse">
      ${postRows}
    </table>
  </div>`;
    })
    .join("");

  const totalPosts = dayKeys.reduce(
    (sum, key) => sum + (postsByDay.get(key)?.length ?? 0),
    0
  );

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2563eb">📅 Your Upcoming Content for This Week</h2>
  <p>You have <strong>${totalPosts}</strong> post${totalPosts === 1 ? "" : "s"} scheduled over the next ${lookAheadDays} days.</p>
  ${daySections}
  <p style="margin-top:24px">
    <a href="${appUrl()}/calendar" style="color:#2563eb;margin-right:16px">Go to Calendar →</a>
    <a href="${appUrl()}/posts" style="color:#2563eb">View all posts →</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#999">
    This content digest is sent based on your preferences.<br>
    Manage your digest settings at <a href="${appUrl()}/settings">${appUrl()}/settings</a>.
  </p>
</body>
</html>`;
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createContentDigestWorker(): Worker<ContentDigestJobData> {
  return new Worker<ContentDigestJobData>(
    QUEUE_NAMES.CONTENT_DIGEST,
    async (job: Job<ContentDigestJobData>) => {
      workerLogger.info({ jobId: job.id }, "Content digest scan started");

      const nowUtc = new Date();
      const currentDayOfWeek = nowUtc.getUTCDay(); // 0=Sun, 1=Mon...
      const currentHourUTC = nowUtc.getUTCHours();

      // Find all users who have content digest enabled
      const configs = await prisma.contentDigestConfig.findMany({
        where: { enabled: true },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              emailNotifications: true,
            },
          },
        },
      });

      let sent = 0;
      let skipped = 0;

      for (const config of configs) {
        const user = config.user;

        // Skip if user has globally disabled email notifications
        if (!user.emailNotifications) {
          skipped++;
          continue;
        }

        // Check if now matches the configured day and hour (UTC)
        if (
          config.dayOfWeek !== currentDayOfWeek ||
          config.hourUTC !== currentHourUTC
        ) {
          skipped++;
          continue;
        }

        // Fetch upcoming scheduled posts
        const lookAheadEnd = new Date(
          nowUtc.getTime() + config.lookAheadDays * 24 * 60 * 60 * 1000
        );

        const posts = await prisma.post.findMany({
          where: {
            userId: user.id,
            status: PostStatus.SCHEDULED,
            scheduledAt: {
              gte: nowUtc,
              lte: lookAheadEnd,
            },
          },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, content: true, scheduledAt: true },
        });

        // Group posts by day
        const postsByDay = new Map<string, DigestPost[]>();
        for (const post of posts) {
          if (!post.scheduledAt) continue;
          const dayKey = formatDate(post.scheduledAt);
          const existing = postsByDay.get(dayKey) ?? [];
          existing.push({
            id: post.id,
            content: post.content,
            scheduledAt: post.scheduledAt,
          });
          postsByDay.set(dayKey, existing);
        }

        const html = buildContentDigestEmail(
          config.lookAheadDays,
          postsByDay,
          config.includeContent
        );

        const dayName = DAY_NAMES[config.dayOfWeek] ?? "scheduled day";
        const ok = await sendEmail({
          to: user.email,
          subject: `[PostFlow] Your upcoming content preview — ${posts.length} post${posts.length === 1 ? "" : "s"} scheduled`,
          html,
        });

        if (ok) {
          sent++;
          workerLogger.info(
            { userId: user.id, postsCount: posts.length, dayName },
            "Content digest email sent"
          );
        } else {
          workerLogger.warn(
            { userId: user.id },
            "Failed to send content digest email"
          );
        }
      }

      workerLogger.info(
        { sent, skipped, total: configs.length },
        "Content digest scan complete"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
