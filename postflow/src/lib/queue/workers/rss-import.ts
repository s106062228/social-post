import { Worker, Job } from "bullmq";
import { MediaType, PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndParseFeed, RssFetchError } from "@/lib/rss";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";

// ── Job payloads ────────────────────────────────────────────────────────────────

export interface RssImportScanJobData {
  triggeredAt: string;
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processRssImportJob(
  job: Job<RssImportScanJobData>
): Promise<void> {
  workerLogger.info({ triggeredAt: job.data.triggeredAt }, "RSS import scan triggered");

  const feeds = await prisma.rssFeed.findMany({
    select: { id: true, userId: true, url: true, autoCreate: true },
  });

  if (feeds.length === 0) return;

  workerLogger.info({ count: feeds.length }, "Processing RSS feeds");

  for (const feed of feeds) {
    try {
      const parsed = await fetchAndParseFeed(feed.url);

      let newItemCount = 0;
      let postCount = 0;

      for (const item of parsed.items) {
        // Skip items already imported
        const existing = await prisma.rssItem.findUnique({
          where: { feedId_guid: { feedId: feed.id, guid: item.guid } },
          select: { id: true },
        });
        if (existing) continue;

        let postId: string | undefined;

        if (feed.autoCreate && item.content) {
          const content = [
            item.title ? `**${item.title}**\n\n` : "",
            item.content ?? "",
            item.link ? `\n\n${item.link}` : "",
          ]
            .join("")
            .trim()
            .slice(0, 63_206);

          const post = await prisma.post.create({
            data: {
              userId: feed.userId,
              content,
              mediaType: MediaType.NONE,
              mediaUrls: [],
              status: PostStatus.DRAFT,
            },
            select: { id: true },
          });
          postId = post.id;
          postCount++;
        }

        await prisma.rssItem.create({
          data: {
            feedId: feed.id,
            guid: item.guid,
            title: item.title,
            content: item.content,
            link: item.link,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt,
            postId,
          },
        });
        newItemCount++;
      }

      await prisma.rssFeed.update({
        where: { id: feed.id },
        data: { lastFetchedAt: new Date() },
      });

      workerLogger.info(
        { feedId: feed.id, newItemCount, postCount },
        "RSS feed processed"
      );
    } catch (error) {
      const message =
        error instanceof RssFetchError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      workerLogger.error({ feedId: feed.id, err: message }, "RSS feed fetch failed");
    }
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createRssImportWorker(): Worker<RssImportScanJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<RssImportScanJobData>(
    QUEUE_NAMES.RSS_IMPORT,
    processRssImportJob,
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job: Job<RssImportScanJobData> | undefined, error: Error) => {
    workerLogger.error(
      { jobId: job?.id, err: error.message },
      "RSS import job failed"
    );
  });

  worker.on("error", (error: Error) => {
    workerLogger.error({ err: error }, "RssImportWorker error");
  });

  return worker;
}
