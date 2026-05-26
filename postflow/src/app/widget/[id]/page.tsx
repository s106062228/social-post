import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const widget = await prisma.feedWidget.findUnique({
    where: { id },
    select: { name: true },
  });
  return {
    title: widget ? widget.name : "Feed Widget",
  };
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
};

export default async function WidgetPage({ params }: PageProps) {
  const { id } = await params;

  const widget = await prisma.feedWidget.findUnique({ where: { id } });
  if (!widget) {
    notFound();
  }

  const publishResults = await prisma.publishResult.findMany({
    where: {
      accountId: { in: widget.accountIds },
      status: "PUBLISHED",
      post: { archivedAt: null },
    },
    orderBy: { publishedAt: "desc" },
    take: widget.maxPosts,
    select: {
      id: true,
      platform: true,
      publishedAt: true,
      publishedUrl: true,
      post: {
        select: {
          id: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
        },
      },
    },
  });

  const isDark = widget.theme === "dark";
  const bg = isDark ? "#111827" : "#f9fafb";
  const cardBg = isDark ? "#1f2937" : "#ffffff";
  const textColor = isDark ? "#f9fafb" : "#111827";
  const mutedColor = isDark ? "#9ca3af" : "#6b7280";
  const borderColor = isDark ? "#374151" : "#e5e7eb";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 background: ${bg}; color: ${textColor}; }
          .feed { display: flex; flex-direction: column; gap: 12px; padding: 16px; max-width: 600px; margin: 0 auto; }
          .card { background: ${cardBg}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 14px; }
          .card-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
          .platform-badge { font-size: 11px; font-weight: 600; color: ${mutedColor}; text-transform: uppercase; letter-spacing: 0.05em; }
          .card-content { font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
          .card-image { width: 100%; max-height: 300px; object-fit: cover; border-radius: 6px; margin-top: 10px; }
          .card-footer { margin-top: 8px; font-size: 12px; color: ${mutedColor}; display: flex; justify-content: space-between; align-items: center; }
          .view-link { color: ${mutedColor}; text-decoration: none; }
          .view-link:hover { text-decoration: underline; }
          .empty { text-align: center; padding: 40px 16px; color: ${mutedColor}; font-size: 14px; }
        `}</style>
      </head>
      <body>
        <div className="feed">
          {publishResults.length === 0 ? (
            <p className="empty">No posts yet.</p>
          ) : (
            publishResults.map((r) => (
              <div key={r.id} className="card">
                <div className="card-meta">
                  {widget.showPlatformIcons && (
                    <span className="platform-badge">
                      {PLATFORM_LABELS[r.platform] ?? r.platform}
                    </span>
                  )}
                </div>
                <p className="card-content">{r.post.content}</p>
                {r.post.mediaUrls.length > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.post.mediaUrls[0]}
                    alt=""
                    className="card-image"
                  />
                )}
                <div className="card-footer">
                  {widget.showTimestamps && r.publishedAt ? (
                    <span>{new Date(r.publishedAt).toLocaleDateString()}</span>
                  ) : (
                    <span />
                  )}
                  {r.publishedUrl && (
                    <a
                      href={r.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-link"
                    >
                      View post →
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </body>
    </html>
  );
}
