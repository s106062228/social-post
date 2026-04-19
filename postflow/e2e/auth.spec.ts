import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./global.setup";

test.describe("Authentication", () => {
  test("unauthenticated user visiting / is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user visiting /posts is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/posts");
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid credentials log in and land on dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#email", TEST_EMAIL);
    await page.fill("#password", TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/");
    // Dashboard heading or sidebar confirms we landed in the app
    await expect(page.getByText("Dashboard").first()).toBeVisible();
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#email", TEST_EMAIL);
    await page.fill("#password", "wrong-password");
    await page.click('button[type="submit"]');

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
