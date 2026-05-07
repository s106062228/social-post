"use client";

import type { Platform } from "@prisma/client";

const PLATFORM_LABELS: Record<Platform, string> = {
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
};

const PREVIEW_TRUNCATE: Record<Platform, number> = {
  FACEBOOK: 125,
  INSTAGRAM: 125,
  THREADS: 300,
  LINKEDIN: 150,
  PINTEREST: 100,
  YOUTUBE: 150,
  TIKTOK: 150,
  TWITTER: 280,
  BLUESKY: 300,
  MASTODON: 500,
  TELEGRAM: 4096,
  REDDIT: 300,
};

function truncate(text: string, maxLen: number): { text: string; truncated: boolean } {
  if (text.length <= maxLen) return { text, truncated: false };
  return { text: text.slice(0, maxLen).trimEnd(), truncated: true };
}

function renderWithHashtags(text: string) {
  return text.split(/(\s+)/).map((word, i) =>
    word.startsWith("#") || word.startsWith("@") ? (
      <span key={i} className="text-blue-500">{word}</span>
    ) : (
      word
    )
  );
}

function FacebookPreview({ content }: { content: string }) {
  const { text, truncated } = truncate(content, PREVIEW_TRUNCATE.FACEBOOK);
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-blue-600 px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-white/30" />
        <div>
          <div className="h-2.5 w-20 rounded bg-white/60" />
          <div className="mt-1 h-2 w-14 rounded bg-white/40" />
        </div>
      </div>
      <div className="p-3">
        {content ? (
          <p className="whitespace-pre-wrap text-sm text-gray-800">
            {text}
            {truncated && (
              <span className="ml-1 cursor-pointer text-blue-600">...See more</span>
            )}
          </p>
        ) : (
          <p className="text-sm italic text-gray-400">Post content will appear here</p>
        )}
      </div>
      <div className="flex gap-4 border-t px-3 py-2 text-xs text-gray-500">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}

function InstagramPreview({ content }: { content: string }) {
  const { text, truncated } = truncate(content, PREVIEW_TRUNCATE.INSTAGRAM);
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
        <span className="text-sm font-semibold text-gray-800">username</span>
      </div>
      <div className="flex aspect-square items-center justify-center bg-gray-100">
        <span className="text-xs text-gray-400">Image / Video</span>
      </div>
      <div className="p-3">
        <div className="mb-2 flex gap-3 text-lg">
          <span>♥</span>
          <span>💬</span>
          <span>↗</span>
        </div>
        {content ? (
          <p className="text-sm text-gray-800">
            <span className="mr-1 font-semibold">username</span>
            <span className="whitespace-pre-wrap">{renderWithHashtags(text)}</span>
            {truncated && (
              <span className="ml-1 cursor-pointer text-gray-400">...more</span>
            )}
          </p>
        ) : (
          <p className="text-sm italic text-gray-400">Caption will appear here</p>
        )}
      </div>
    </div>
  );
}

function ThreadsPreview({ content }: { content: string }) {
  const { text, truncated } = truncate(content, PREVIEW_TRUNCATE.THREADS);
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center">
            <div className="h-7 w-7 rounded-full bg-black" />
            <div className="mt-1 w-0.5 flex-1 bg-gray-200" style={{ minHeight: 20 }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900">username</span>
              <span className="text-xs text-gray-400">· now</span>
            </div>
            {content ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                {text}
                {truncated && (
                  <span className="ml-1 cursor-pointer text-gray-400">...more</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-gray-400">Thread content will appear here</p>
            )}
            <div className="mt-2 flex gap-3 text-gray-400">
              <span className="cursor-pointer hover:text-gray-600">♥</span>
              <span className="cursor-pointer hover:text-gray-600">💬</span>
              <span className="cursor-pointer hover:text-gray-600">↗</span>
              <span className="cursor-pointer hover:text-gray-600">⋯</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PostPreviewProps {
  content: string;
  platforms: Platform[];
}

export function PostPreview({ content, platforms }: PostPreviewProps) {
  const uniquePlatforms = [...new Set(platforms)] as Platform[];

  if (uniquePlatforms.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Select accounts to preview how your post will look.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {uniquePlatforms.map((platform) => (
        <div key={platform}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {PLATFORM_LABELS[platform]}
          </p>
          {platform === "FACEBOOK" && <FacebookPreview content={content} />}
          {platform === "INSTAGRAM" && <InstagramPreview content={content} />}
          {platform === "THREADS" && <ThreadsPreview content={content} />}
        </div>
      ))}
    </div>
  );
}
