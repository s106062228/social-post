/**
 * Seed script for development data.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Creates:
 *  - 1 demo user (demo@postflow.dev / password: demo1234)
 *  - 3 social accounts (FB page, IG, Threads) with dummy encrypted tokens
 *  - 5 sample posts in various states
 *  - Publish results for published posts
 *
 * Safe to run multiple times — idempotent via upserts.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MediaType, Platform, PostStatus, PublishStatus } from "@prisma/client";
import { randomBytes, createCipheriv } from "crypto";
import { scrypt, randomBytes as cryptoRandomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// ── Setup ─────────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = cryptoRandomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Produces a dummy encrypted token string (not a real token).
 * Format matches AES-256-GCM: {iv}:{authTag}:{ciphertext}
 */
function makeDummyEncryptedToken(): string {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (keyHex && Buffer.from(keyHex, "hex").length === 32) {
    // Encrypt a placeholder token with the real key
    const key = Buffer.from(keyHex, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = "seed_dummy_token_" + randomBytes(8).toString("hex");
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  // Fallback: produce a fake-format string (not decryptable)
  const iv = randomBytes(12).toString("hex");
  const authTag = randomBytes(16).toString("hex");
  const ciphertext = randomBytes(24).toString("hex");
  return `${iv}:${authTag}:${ciphertext}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding development data…\n");

  // ── User ────────────────────────────────────────────────────────────────────
  const hashedPassword = await hashPassword("demo1234");

  const user = await prisma.user.upsert({
    where: { email: "demo@postflow.dev" },
    update: {},
    create: {
      email: "demo@postflow.dev",
      name: "Demo User",
      password: hashedPassword,
    },
  });
  console.log(`✅  User: ${user.email} (id: ${user.id})`);

  // ── Social Accounts ──────────────────────────────────────────────────────────
  const fbAccount = await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: user.id,
        platform: Platform.FACEBOOK,
        platformAccountId: "demo_fb_page_123",
      },
    },
    update: {},
    create: {
      userId: user.id,
      platform: Platform.FACEBOOK,
      platformAccountId: "demo_fb_page_123",
      accountName: "Demo Facebook Page",
      encryptedToken: makeDummyEncryptedToken(),
      tokenExpiresAt: null,
      scopes:
        "pages_manage_posts,pages_read_engagement,pages_show_list",
      isActive: true,
    },
  });
  console.log(`✅  Social account: ${fbAccount.accountName} (${fbAccount.platform})`);

  const igAccount = await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: user.id,
        platform: Platform.INSTAGRAM,
        platformAccountId: "demo_ig_456",
      },
    },
    update: {},
    create: {
      userId: user.id,
      platform: Platform.INSTAGRAM,
      platformAccountId: "demo_ig_456",
      accountName: "Demo Facebook Page (Instagram)",
      encryptedToken: makeDummyEncryptedToken(),
      tokenExpiresAt: null,
      scopes:
        "instagram_basic,instagram_content_publish",
      isActive: true,
    },
  });
  console.log(`✅  Social account: ${igAccount.accountName} (${igAccount.platform})`);

  const threadsAccount = await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: user.id,
        platform: Platform.THREADS,
        platformAccountId: "demo_threads_789",
      },
    },
    update: {},
    create: {
      userId: user.id,
      platform: Platform.THREADS,
      platformAccountId: "demo_threads_789",
      accountName: "demo_user",
      encryptedToken: makeDummyEncryptedToken(),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      scopes: "threads_basic,threads_content_publish,threads_manage_insights",
      isActive: true,
    },
  });
  console.log(`✅  Social account: ${threadsAccount.accountName} (${threadsAccount.platform})`);

  // ── Posts ─────────────────────────────────────────────────────────────────────

  // 1. Draft post
  const draftPost = await prisma.post.create({
    data: {
      userId: user.id,
      content: "This is a draft post that hasn't been published yet. 📝",
      mediaType: MediaType.NONE,
      mediaUrls: [],
      status: PostStatus.DRAFT,
    },
  });
  console.log(`✅  Post: DRAFT (id: ${draftPost.id})`);

  // 2. Scheduled post (future)
  const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
  const scheduledPost = await prisma.post.create({
    data: {
      userId: user.id,
      content: "Exciting news coming in two days! Stay tuned. 🚀",
      mediaType: MediaType.NONE,
      mediaUrls: [],
      scheduledAt,
      status: PostStatus.SCHEDULED,
    },
  });
  console.log(`✅  Post: SCHEDULED for ${scheduledAt.toISOString()} (id: ${scheduledPost.id})`);

  // 3. Published post (all platforms succeeded)
  const publishedPost = await prisma.post.create({
    data: {
      userId: user.id,
      content:
        "Hello world from PostFlow! Managing all your social media in one place. 🌐 #PostFlow #SocialMedia",
      mediaType: MediaType.NONE,
      mediaUrls: [],
      status: PostStatus.PUBLISHED,
    },
  });
  await prisma.publishResult.createMany({
    data: [
      {
        postId: publishedPost.id,
        platform: Platform.FACEBOOK,
        accountId: fbAccount.id,
        status: PublishStatus.PUBLISHED,
        platformPostId: "fb_post_abc123",
        publishedUrl: "https://www.facebook.com/demo_fb_page_123/posts/abc123",
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      },
      {
        postId: publishedPost.id,
        platform: Platform.INSTAGRAM,
        accountId: igAccount.id,
        status: PublishStatus.PUBLISHED,
        platformPostId: "ig_media_def456",
        publishedUrl: "https://www.instagram.com/p/def456",
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        postId: publishedPost.id,
        platform: Platform.THREADS,
        accountId: threadsAccount.id,
        status: PublishStatus.PUBLISHED,
        platformPostId: "threads_post_ghi789",
        publishedUrl: "https://www.threads.net/@demo_user/post/ghi789",
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    ],
  });
  console.log(`✅  Post: PUBLISHED to all 3 platforms (id: ${publishedPost.id})`);

  // 4. Partially published post (one platform failed)
  const partialPost = await prisma.post.create({
    data: {
      userId: user.id,
      content: "Check out our latest update! Some links may not preview correctly.",
      mediaType: MediaType.NONE,
      mediaUrls: [],
      status: PostStatus.PARTIALLY_PUBLISHED,
    },
  });
  await prisma.publishResult.createMany({
    data: [
      {
        postId: partialPost.id,
        platform: Platform.FACEBOOK,
        accountId: fbAccount.id,
        status: PublishStatus.PUBLISHED,
        platformPostId: "fb_post_xyz999",
        publishedUrl: "https://www.facebook.com/demo_fb_page_123/posts/xyz999",
        publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      },
      {
        postId: partialPost.id,
        platform: Platform.INSTAGRAM,
        accountId: igAccount.id,
        status: PublishStatus.FAILED,
        error: "Media container status: ERROR — unsupported media format",
        retryCount: 3,
      },
    ],
  });
  console.log(`✅  Post: PARTIALLY_PUBLISHED (FB ok, IG failed) (id: ${partialPost.id})`);

  // 5. Failed post
  const failedPost = await prisma.post.create({
    data: {
      userId: user.id,
      content: "This post failed to publish due to an API error.",
      mediaType: MediaType.NONE,
      mediaUrls: [],
      status: PostStatus.FAILED,
    },
  });
  await prisma.publishResult.createMany({
    data: [
      {
        postId: failedPost.id,
        platform: Platform.FACEBOOK,
        accountId: fbAccount.id,
        status: PublishStatus.FAILED,
        error: "OAuthException: (#200) The user hasn't authorized the application to perform this action",
        retryCount: 3,
      },
    ],
  });
  console.log(`✅  Post: FAILED (id: ${failedPost.id})`);

  console.log("\n🎉  Seed complete!\n");
  console.log("  Login: demo@postflow.dev");
  console.log("  Password: demo1234\n");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
