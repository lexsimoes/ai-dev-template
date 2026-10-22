// spec: specs/e2e/critical-flows.md
// seed: e2e/seed.spec.ts

import { test, expect } from "./fixtures.ts";

test.describe("Coupon rejection (INV-001)", () => {
  test("INV-001: an expired coupon gives no discount and explains the expiry", async ({ page }) => {
    const codeInput = page.getByRole("textbox", { name: "Discount code (optional)" });
    const applyButton = page.getByRole("button", { name: "Apply code" });
    const total = page.getByTestId("total");

    // 1. Go to `/`, fill the code with `summer20` and click 'Apply code'
    await page.goto("/");
    await codeInput.fill("summer20");
    await applyButton.click();

    await expect(page.getByRole("alert")).toHaveText(
      "The code SUMMER20 expired on August 31, 2025. Your total has no discount.",
    );
    await expect(codeInput).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Discount \(/)).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: "Subtotal" })).toContainText("$50.00");
    await expect(total).toHaveText("$50.00");

    // 2. Replace the code with `HALF` and apply
    await codeInput.fill("HALF");
    await applyButton.click();

    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(total).toHaveText("$25.00");
  });
});
