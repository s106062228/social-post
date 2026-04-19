import { test, expect } from "@playwright/test";

// These tests run with storageState = e2e/.auth/user.json (authenticated)
// Global setup seeds a Facebook account, so the page reflects one connected platform.

test.describe("Accounts page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: "Connected Accounts" })).toBeVisible();
  });

  test("renders platform status indicators for Facebook, Instagram, and Threads", async ({
    page,
  }) => {
    await expect(page.getByText("Facebook")).toBeVisible();
    await expect(page.getByText("Instagram")).toBeVisible();
    await expect(page.getByText("Threads")).toBeVisible();
  });

  test("shows connected badge when at least one Meta account is connected", async ({
    page,
  }) => {
    // Global setup seeded a Facebook account, so hasAnyMeta = true → Connected badge
    await expect(page.getByText("Connected")).toBeVisible();
  });

  test("shows 'Not connected' for unlinked platforms", async ({ page }) => {
    // Only Facebook was seeded; Instagram and Threads should be 'Not connected'
    const notConnectedItems = page.getByText("Not connected");
    await expect(notConnectedItems.first()).toBeVisible();
  });

  test("Meta Platforms card is visible", async ({ page }) => {
    await expect(page.getByText("Meta Platforms")).toBeVisible();
    await expect(
      page.getByText("Connect Facebook, Instagram, and Threads with a single OAuth flow.")
    ).toBeVisible();
  });
});
