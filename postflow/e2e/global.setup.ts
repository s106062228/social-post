import { chromium } from "@playwright/test";
import { PrismaClient, Platform } from "@prisma/client";
import { createCipheriv, randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "http://localhost:3000";
export const TEST_EMAIL = "e2e@postflow.test";
export const TEST_PASSWORD = "E2ePassword123!";
const AUTH_FILE = path.join(__dirname, ".auth/user.json");

// Mirrors encryptToken from src/lib/encryption.ts — avoids importing Next.js server code
function encryptTestToken(plaintext: string): string {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY ?? "0".repeat(64);
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

async function globalSetup() {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  // Register test user — ignore errors if already exists
  await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "E2E Test User",
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  }).catch(() => undefined);

  // Log in and persist the session cookie for authenticated tests
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", TEST_EMAIL);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`);

  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();

  // Seed a Facebook social account so PostComposer renders in post tests
  // PrismaClient reads DATABASE_URL from process.env automatically
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (user) {
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_platformAccountId: {
            userId: user.id,
            platform: Platform.FACEBOOK,
            platformAccountId: "e2e-test-fb-page",
          },
        },
        update: {},
        create: {
          userId: user.id,
          platform: Platform.FACEBOOK,
          platformAccountId: "e2e-test-fb-page",
          accountName: "E2E Test Page",
          encryptedToken: encryptTestToken("fake-access-token"),
          scopes: "pages_manage_posts",
          isActive: true,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
