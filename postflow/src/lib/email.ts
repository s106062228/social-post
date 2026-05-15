import nodemailer, { type Transporter } from "nodemailer";
import { PostStatus, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notifications";

const emailLogger = logger.child({ context: "email" });

// ── SMTP configuration ─────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const from =
    process.env.SMTP_FROM ?? `PostFlow <${user}>`;

  return { host, port, user, pass, from };
}

let _transporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const cfg = getSmtpConfig();
  if (!cfg) return null;

  _transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  return _transporter;
}

// Exported for testing — resets the singleton so tests can inject fresh mocks.
export function resetTransporter(): void {
  _transporter = null;
}

// ── Low-level send ─────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const cfg = getSmtpConfig();
  const transporter = getTransporter();

  if (!cfg || !transporter) {
    emailLogger.warn("SMTP not configured — skipping email notification");
    return false;
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    emailLogger.info({ to: options.to, subject: options.subject }, "Email sent");
    return true;
  } catch (err) {
    emailLogger.error({ err, to: options.to }, "Failed to send email");
    return false;
  }
}

// ── HTML templates ─────────────────────────────────────────────────────────────

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function excerpt(content: string, max = 200): string {
  const text = content.replace(/<[^>]+>/g, "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function baseHtml(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  ${bodyContent}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#999">
    You received this email because email notifications are enabled for your PostFlow account.<br>
    Manage preferences at <a href="${appUrl()}/settings">${appUrl()}/settings</a>.
  </p>
</body>
</html>`;
}

export function buildPublishedEmail(
  postContent: string,
  platformCount: number
): string {
  return baseHtml(`
    <h2 style="color:#16a34a">✓ Post published!</h2>
    <p>Your post was successfully published to <strong>${platformCount}</strong>
      platform${platformCount === 1 ? "" : "s"}.</p>
    <blockquote style="border-left:3px solid #16a34a;padding-left:1em;color:#555;margin:16px 0">
      ${excerpt(postContent)}
    </blockquote>
    <p><a href="${appUrl()}/posts" style="color:#2563eb">View all posts →</a></p>
  `);
}

export function buildFailedEmail(
  postContent: string,
  errors: string[]
): string {
  const errorItems = errors.map((e) => `<li>${e}</li>`).join("");
  return baseHtml(`
    <h2 style="color:#dc2626">✗ Post failed to publish</h2>
    <p>Your post could not be published after multiple attempts.</p>
    <blockquote style="border-left:3px solid #dc2626;padding-left:1em;color:#555;margin:16px 0">
      ${excerpt(postContent)}
    </blockquote>
    ${errors.length > 0 ? `<p><strong>Errors:</strong></p><ul>${errorItems}</ul>` : ""}
    <p><a href="${appUrl()}/posts" style="color:#2563eb">Retry your post →</a></p>
  `);
}

export function buildPartialEmail(
  postContent: string,
  publishedCount: number,
  failedCount: number
): string {
  return baseHtml(`
    <h2 style="color:#d97706">⚠ Post partially published</h2>
    <p>
      <strong>${publishedCount}</strong> platform${publishedCount === 1 ? "" : "s"} succeeded,
      <strong>${failedCount}</strong> failed.
    </p>
    <blockquote style="border-left:3px solid #d97706;padding-left:1em;color:#555;margin:16px 0">
      ${excerpt(postContent)}
    </blockquote>
    <p><a href="${appUrl()}/posts" style="color:#2563eb">View post details →</a></p>
  `);
}

// ── High-level notification ────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<PostStatus>([
  PostStatus.PUBLISHED,
  PostStatus.PARTIALLY_PUBLISHED,
  PostStatus.FAILED,
]);

/**
 * Fire-and-forget: sends an email notification for terminal post outcomes.
 * Respects the user's emailNotifications preference.
 * Never throws — all errors are logged internally.
 */
export function notifyPostOutcome(
  postId: string,
  finalStatus: PostStatus
): void {
  if (!TERMINAL_STATUSES.has(finalStatus)) return;

  _notifyPostOutcomeAsync(postId, finalStatus).catch((err: unknown) => {
    emailLogger.error({ err, postId }, "Unhandled error in notifyPostOutcome");
  });
}

async function isEmailPrefEnabled(
  userId: string,
  notificationType: string
): Promise<boolean> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_notificationType: { userId, notificationType } },
      select: { email: true },
    });
    return pref?.email ?? true;
  } catch {
    return true;
  }
}

async function _notifyPostOutcomeAsync(
  postId: string,
  finalStatus: PostStatus
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      user: { select: { id: true, email: true, emailNotifications: true } },
      publishResults: {
        select: { status: true, error: true, platform: true },
      },
    },
  });

  if (!post) {
    emailLogger.warn({ postId }, "notifyPostOutcome: post not found");
    return;
  }

  if (!post.user.emailNotifications) return;

  // Check per-type email preference
  const typeKey =
    finalStatus === PostStatus.PUBLISHED
      ? NOTIFICATION_TYPES.POST_PUBLISHED
      : finalStatus === PostStatus.FAILED
        ? NOTIFICATION_TYPES.POST_FAILED
        : NOTIFICATION_TYPES.POST_PARTIALLY_PUBLISHED;

  const emailEnabled = await isEmailPrefEnabled(post.user.id, typeKey);
  if (!emailEnabled) return;

  type ResultRow = (typeof post.publishResults)[number];

  const published = post.publishResults.filter(
    (r: ResultRow) => r.status === PublishStatus.PUBLISHED
  );
  const failed = post.publishResults.filter(
    (r: ResultRow) => r.status === PublishStatus.FAILED
  );

  let subject: string;
  let html: string;

  if (finalStatus === PostStatus.PUBLISHED) {
    subject = "[PostFlow] Your post has been published";
    html = buildPublishedEmail(post.content, published.length);
  } else if (finalStatus === PostStatus.FAILED) {
    subject = "[PostFlow] Your post failed to publish";
    const errors = failed
      .map((r: ResultRow) => `${String(r.platform)}: ${r.error ?? "Unknown error"}`)
      .filter(Boolean);
    html = buildFailedEmail(post.content, errors);
  } else {
    // PARTIALLY_PUBLISHED
    subject = "[PostFlow] Your post was partially published";
    html = buildPartialEmail(post.content, published.length, failed.length);
  }

  await sendEmail({ to: post.user.email, subject, html });
}
