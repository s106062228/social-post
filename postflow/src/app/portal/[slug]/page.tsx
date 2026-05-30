import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface PortalMeta {
  title: string;
  description: string | null;
  accentColor: string;
  showCalendar: boolean;
  showAnalytics: boolean;
  showPosts: boolean;
  expiresAt: string | null;
  views: number;
}

interface CalPost {
  id: string;
  content: string;
  scheduledAt: string | null;
  status: string;
  mediaType: string;
  platforms: string[];
}

interface AnalyticsData {
  totalPublished: number;
  scheduledCount: number;
  platformBreakdown: { platform: string; count: number }[];
  last30DayActivity: { date: string; count: number }[];
}

function getBase(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

async function getPortalMeta(slug: string): Promise<PortalMeta | null> {
  try {
    const res = await fetch(`${getBase()}/api/portal/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<PortalMeta>;
  } catch {
    return null;
  }
}

async function getCalendarPosts(slug: string): Promise<CalPost[]> {
  try {
    const res = await fetch(`${getBase()}/api/portal/${slug}/calendar`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts ?? [];
  } catch {
    return [];
  }
}

async function getAnalytics(slug: string): Promise<AnalyticsData | null> {
  try {
    const res = await fetch(`${getBase()}/api/portal/${slug}/analytics`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<AnalyticsData>;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getPortalMeta(slug);
  return {
    title: meta ? `${meta.title} — Client Portal` : "Client Portal",
    description: meta?.description ?? undefined,
  };
}

const STATUS_CHIP: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-green-100 text-green-800",
};

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-500",
  INSTAGRAM: "bg-pink-500",
  TWITTER: "bg-sky-500",
  THREADS: "bg-gray-800",
  LINKEDIN: "bg-blue-700",
  TIKTOK: "bg-black",
  YOUTUBE: "bg-red-600",
  PINTEREST: "bg-red-500",
  REDDIT: "bg-orange-600",
  BLUESKY: "bg-sky-400",
  MASTODON: "bg-indigo-500",
  TELEGRAM: "bg-cyan-500",
  NOSTR: "bg-purple-600",
  TUMBLR: "bg-slate-700",
  WORDPRESS: "bg-blue-800",
  MEDIUM: "bg-gray-900",
  GHOST: "bg-yellow-600",
  DEVTO: "bg-gray-900",
  HASHNODE: "bg-blue-600",
  BEEHIIV: "bg-yellow-500",
  PIXELFED: "bg-green-500",
  VIMEO: "bg-teal-500",
  GOOGLE_BUSINESS: "bg-green-600",
};

export default async function PortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getPortalMeta(slug);

  if (!meta) notFound();

  const [posts, analytics] = await Promise.all([
    meta.showCalendar || meta.showPosts ? getCalendarPosts(slug) : Promise.resolve([]),
    meta.showAnalytics ? getAnalytics(slug) : Promise.resolve(null),
  ]);

  const scheduledPosts = posts
    .filter((p) => p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

  const recentPosts = [...posts]
    .sort((a, b) => {
      const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return bTime - aTime;
    })
    .filter((p) => p.status === "PUBLISHED")
    .slice(0, 10);

  const accent = meta.accentColor;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="py-12 px-6 text-white"
        style={{ backgroundColor: accent }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold">{meta.title}</h1>
          {meta.description && (
            <p className="mt-2 text-white/80 text-lg">{meta.description}</p>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Analytics section */}
        {meta.showAnalytics && analytics && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">{analytics.totalPublished}</div>
                <div className="text-sm text-gray-500 mt-1">Published Posts</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">{analytics.scheduledCount}</div>
                <div className="text-sm text-gray-500 mt-1">Scheduled</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {analytics.platformBreakdown.length}
                </div>
                <div className="text-sm text-gray-500 mt-1">Platforms</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {analytics.last30DayActivity.reduce((s, d) => s + d.count, 0)}
                </div>
                <div className="text-sm text-gray-500 mt-1">Posts (30 days)</div>
              </div>
            </div>

            {analytics.platformBreakdown.length > 0 && (
              <div className="mt-4 bg-white rounded-lg shadow-sm p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Platform Activity</h3>
                <div className="flex flex-wrap gap-2">
                  {analytics.platformBreakdown.map((p) => (
                    <div key={p.platform} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-gray-400"}`}
                      />
                      <span className="text-sm text-gray-700">{p.platform.charAt(0) + p.platform.slice(1).toLowerCase()}</span>
                      <span className="text-sm font-medium text-gray-900">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Upcoming schedule */}
        {meta.showCalendar && scheduledPosts.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Schedule</h2>
            <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
              {scheduledPosts.slice(0, 20).map((post) => {
                const d = post.scheduledAt ? new Date(post.scheduledAt) : null;
                return (
                  <div key={post.id} className="p-4 flex items-start gap-4">
                    {d && (
                      <div className="text-center min-w-[56px]">
                        <div
                          className="text-xs font-medium uppercase rounded-t px-2 py-0.5 text-white"
                          style={{ backgroundColor: accent }}
                        >
                          {d.toLocaleString("en-US", { month: "short" })}
                        </div>
                        <div className="text-2xl font-bold text-gray-900 leading-none py-1 border border-t-0 border-gray-200 rounded-b">
                          {d.getDate()}
                        </div>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 line-clamp-2">{post.content}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {d && (
                          <span className="text-xs text-gray-500">
                            {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_CHIP[post.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {post.status.charAt(0) + post.status.slice(1).toLowerCase()}
                        </span>
                        <div className="flex gap-1">
                          {post.platforms.map((pl) => (
                            <span
                              key={pl}
                              className={`w-2 h-2 rounded-full ${PLATFORM_COLORS[pl] ?? "bg-gray-400"}`}
                              title={pl}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent posts */}
        {meta.showPosts && recentPosts.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Posts</h2>
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div key={post.id} className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-sm text-gray-700">{post.content}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {post.scheduledAt && (
                      <span className="text-xs text-gray-500">
                        {new Date(post.scheduledAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <div className="flex gap-1">
                      {post.platforms.map((pl) => (
                        <span
                          key={pl}
                          className={`w-2 h-2 rounded-full ${PLATFORM_COLORS[pl] ?? "bg-gray-400"}`}
                          title={pl}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!meta.showCalendar && !meta.showAnalytics && !meta.showPosts && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No content sections are enabled for this portal.</p>
          </div>
        )}
      </main>

      <footer className="mt-12 py-6 text-center text-xs text-gray-400">
        Powered by PostFlow
      </footer>
    </div>
  );
}
