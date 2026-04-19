import { test, expect } from "@playwright/test";

// These tests run with storageState = e2e/.auth/user.json (authenticated)
// Global setup seeds a Facebook social account so PostComposer renders.

const DRAFT_CONTENT = `E2E draft post ${Date.now()}`;

test.describe("Post Composer", () => {
  test("creates a draft post that appears in the posts list", async ({ page }) => {
    await page.goto("/posts/new");

    // PostComposer renders (social account was seeded in global setup)
    await expect(page.getByRole("heading", { name: "Create Post" })).toBeVisible();

    // Fill in post content
    await page.fill("#content", DRAFT_CONTENT);

    // Save draft (no scheduledAt → button text is "Save draft")
    await page.getByRole("button", { name: "Save draft" }).click();

    // Should navigate to posts list after saving
    await expect(page).toHaveURL("/posts");

    // The draft post should appear in the list
    await expect(page.getByText(DRAFT_CONTENT)).toBeVisible();
  });

  test("/posts/new redirects to /login when session expires", async ({ browser }) => {
    // Open a fresh context without auth state to simulate expired session
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/posts/new");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
