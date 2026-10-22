// spec: specs/e2e/critical-flows.md
// seed: e2e/seed.spec.ts

import { test, expect } from "./fixtures.ts";

test.describe("Checkout coupons", () => {
  test("CA-02: a valid percentage coupon lowers the total by the right amount", async ({ page }) => {
    const summary = page.getByRole("region", { name: "Order summary" });
    const codeInput = page.getByRole("textbox", { name: "Discount code (optional)" });
    const applyButton = page.getByRole("button", { name: "Apply code" });

    // 1. Go to `/`. Read the order summary region.
    await page.goto("/");
    await expect(summary.getByText("Subtotal").locator("..")).toContainText("$50.00");
    await expect(summary.getByTestId("total")).toHaveText("$50.00");
    await expect(summary.getByText("Discount", { exact: false })).toHaveCount(0);

    // 2. Fill the code (lowercase, padded) and click 'Apply code'.
    await codeInput.fill(" welcome10 ");
    const [response] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname === "/checkout"),
      applyButton.click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("status")).toHaveText("Code WELCOME10 applied: 10% off.");
    await expect(summary.getByText("Discount (WELCOME10)").locator("..")).toContainText("−$5.00");
    await expect(summary.getByText("Subtotal").locator("..")).toContainText("$50.00");
    await expect(summary.getByTestId("total")).toHaveText("$45.00");
    await expect(codeInput).toHaveValue("WELCOME10");

    // 3. Go to `/`, enter HALF and click 'Apply code'.
    await page.goto("/");
    await codeInput.fill("HALF");
    await applyButton.click();
    await expect(page.getByRole("status")).toHaveText("Code HALF applied: 50% off.");
    await expect(summary.getByText("Discount (HALF)").locator("..")).toContainText("−$25.00");
    await expect(summary.getByTestId("total")).toHaveText("$25.00");
  });
});
