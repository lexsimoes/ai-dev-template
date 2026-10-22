// spec: specs/e2e/critical-flows.md
// seed: e2e/seed.spec.ts

import { test, expect } from "./fixtures.ts";

test.describe("Coupon rejection (INV-001)", () => {
  test("INV-001: an unknown coupon gives no discount and shows a clear error with a next step", async ({ page }) => {
    await page.goto("/");
    const codeInput = page.getByRole("textbox", { name: "Discount code (optional)" });
    const applyButton = page.getByRole("button", { name: "Apply code" });
    const total = page.getByTestId("total");
    const alert = page.getByRole("alert");

    // 1. Go to `/`, fill 'Discount code (optional)' with `NOPE99` and click 'Apply code'.
    await codeInput.fill("NOPE99");
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/checkout"),
      applyButton.click(),
    ]);
    expect(response.status()).toBe(422);
    await expect(alert).toHaveText("We don't recognize the code “NOPE99”. Check the spelling, or pay without a coupon.");
    await expect(alert).not.toContainText(/stack|undefined|exception|Error:/i);
    await expect(codeInput).toHaveAttribute("aria-invalid", "true");
    await expect(codeInput).toHaveValue("NOPE99");
    await expect(page.getByText(/^Discount/, { exact: false }).filter({ hasText: "−" })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: "Subtotal" })).toContainText("$50.00");
    await expect(total).toHaveText("$50.00");

    // 2. Replace the text with `WELCOME10` and click 'Apply code'.
    await codeInput.fill("WELCOME10");
    await applyButton.click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole("status")).toBeVisible();
    await expect(total).toHaveText("$45.00");

    // 3. Fresh load of `/`, submit an empty code and a whitespace-only code.
    await page.goto("/");
    await applyButton.click();
    await expect(alert).toHaveCount(0);
    await expect(total).toHaveText("$50.00");
    await codeInput.fill("   ");
    await applyButton.click();
    await expect(alert).toHaveCount(0);
    await expect(total).toHaveText("$50.00");

    // 4. Submit a hostile code such as `<b>x</b>` and a very long code (500 chars).
    await codeInput.fill("<b>x</b>");
    await applyButton.click();
    await expect(alert).toContainText(/We don't recognize the code “<b>x<\/b>”/i);
    await expect(alert.locator("b")).toHaveCount(0);
    await expect(total).toHaveText("$50.00");

    await codeInput.fill("A".repeat(500));
    await applyButton.click();
    await expect(alert).toContainText("We don't recognize the code");
    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
    await expect(total).toHaveText("$50.00");
  });
});
