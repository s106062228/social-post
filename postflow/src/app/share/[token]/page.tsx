import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import { PostPreview } from "@/components/post-preview";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;

  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      post: {
        select: {
          content: true,
          mediaType: true,
          mediaUrls: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          publishResults: {
            select: { platform: true },
          },
        },
      },
    },
  });

  if (!shareLink) {
    notFound();
  }

  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <p className="text-2xl">⏰</p>
          <h1 className="mt-2 text-lg font-semibold text-gray-900">Link Expired</h1>
          <p className="mt-1 text-sm text-gray-500">
            This preview link has expired and is no longer accessible.
          </p>
        </div>
      </main>
    );
  }

  await prisma.shareLink.update({
    where: { token },
    data: { views: { increment: 1 } },
  });

  const { post } = shareLink;
  const platforms = [
    ...new Set(post.publishResults.map((r) => r.platform)),
  ] as Platform[];

  const displayPlatforms =
    platforms.length > 0
      ? platforms
      : ([Platform.FACEBOOK, Platform.INSTAGRAM, Platform.THREADS] as Platform[]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-1.5 text-sm text-gray-500 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              PostFlow — Shared Preview
            </span>
          </div>
        </div>

        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Post Content
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{post.content}</p>
          {post.mediaUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.mediaUrls.map((url) => (
                <span
                  key={url}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                >
                  {url}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {post.status.replace(/_/g, " ").toLowerCase()}
            </span>
            {post.scheduledAt && (
              <span className="text-xs text-gray-400">
                Scheduled: {new Date(post.scheduledAt).toLocaleString()}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {shareLink.views + 1} view{shareLink.views + 1 !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <h2 className="mb-4 text-sm font-semibold text-gray-700">Platform Previews</h2>
        <PostPreview content={post.content} platforms={displayPlatforms} />

        {shareLink.expiresAt && (
          <p className="mt-6 text-center text-xs text-gray-400">
            This link expires {new Date(shareLink.expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </main>
  );
}
