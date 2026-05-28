import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface CalPost {
  id: string;
  content: string | null;
  scheduledAt: string;
  status: string;
  mediaType: string;
  platforms: string[];
}

interface CalendarData {
  title: string;
  showContent: boolean;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  expiresAt: string | null;
  views: number;
  posts: CalPost[];
}

async function getCalendarData(token: string): Promise<CalendarData | null> {
  try {
    const base =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${base}/api/cal/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<CalendarData>;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getCalendarData(token);
  return {
    title: data ? `${data.title} — Content Calendar` : "Content Calendar",
  };
}

function groupByMonth(posts: CalPost[]): [string, CalPost[]][] {
  const map = new Map<string, CalPost[]>();
  for (const post of posts) {
    const d = new Date(post.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PUBLISHED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export default async function PublicCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getCalendarData(token);

  if (!data) notFound();

  const months = groupByMonth(data.posts);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold">{data.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.posts.length} post{data.posts.length !== 1 ? "s" : ""} scheduled
            {data.startDate && ` · From ${data.startDate}`}
            {data.endDate && ` to ${data.endDate}`}
            {data.expiresAt && (
              <span className="ml-2 text-yellow-600">
                · Expires {new Date(data.expiresAt).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {data.posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No scheduled posts to display.
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {months.map(([monthKey, posts]) => {
              const [year, month] = monthKey.split("-").map(Number);
              return (
                <section key={monthKey}>
                  <h2 className="text-lg font-semibold mb-4 pb-2 border-b">
                    {MONTH_NAMES[month - 1]} {year}
                  </h2>
                  <div className="flex flex-col gap-3">
                    {posts.map((post) => {
                      const d = new Date(post.scheduledAt);
                      return (
                        <div
                          key={post.id}
                          className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-none w-14 text-center">
                            <div className="text-2xl font-bold leading-none tabular-nums">
                              {d.getDate()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {DAY_NAMES[d.getDay()]}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                              {d.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            {data.showContent && post.content ? (
                              <p className="text-sm line-clamp-3">{post.content}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                Content hidden
                              </p>
                            )}
                            {post.platforms.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {post.platforms.map((p) => (
                                  <span
                                    key={p}
                                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex-none">
                            <span
                              className={`text-xs px-2 py-1 rounded-full font-medium ${
                                STATUS_STYLES[post.status] ??
                                "bg-muted text-muted-foreground"
                              }`}
                            >
                              {post.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t mt-16">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center text-xs text-muted-foreground">
          Powered by PostFlow
        </div>
      </footer>
    </div>
  );
}
