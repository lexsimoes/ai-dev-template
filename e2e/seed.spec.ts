// Seed for the Playwright test agents (planner, generator, healer): the page they start from.
// It uses the isolated fixtures, like every test in e2e/.

import { test, expect } from "./fixtures.ts";

test.describe("Seed", () => {
  test("seed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
