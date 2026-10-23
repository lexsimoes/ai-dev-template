// spec: specs/e2e/critical-flows.md
// seed: e2e/seed.spec.ts
// Issue #33 (exploratory session): a message within the limit was refused when it had line breaks.

import { test, expect } from "./fixtures.ts";

const LIMIT = 2_000;
const STATED = "2,000 characters (a line break counts as one)";

/** A message the browser counts as exactly `length` characters, starting with a unique marker. */
function message(marker: string, line: string, length: number): string {
  let text = marker;
  while (text.length < length) text += `\n${line}`;
  return text.slice(0, length);
}

test.describe("Contact message limit", () => {
  test("CA-03: a message within the stated limit is sent, whatever its line breaks or alphabet", async ({ page }) => {
    const box = page.getByRole("textbox", { name: "Your message" });
    const id = crypto.randomUUID().slice(0, 8);

    // 1. The browser enforces the limit
    await page.goto("/contact");
    await expect(box).toHaveAttribute("maxlength", String(LIMIT));

    // 2. Exactly at the limit with about 200 line breaks, and exactly at the limit in a non-Latin alphabet
    for (const [name, text] of [
      ["line breaks", message(`E2E-LIMIT-${id}-lines`, "Order 1234", LIMIT)],
      ["non-Latin", message(`E2E-LIMIT-${id}-kana`, "注文の荷物がまだ届きません", LIMIT)],
    ] as const) {
      await page.goto("/contact");
      await box.fill(text);
      expect(await box.evaluate((el: HTMLTextAreaElement) => el.value.length), name).toBe(LIMIT);
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page, name).toHaveURL(/\/contact\?sent=1$/);
      await expect(page.getByRole("status")).toHaveText("Thanks, we got your message. Our team replies within one business day.");
    }

    // 3. Both reach the Support inbox
    await page.goto("/support");
    const messages = page.getByRole("region", { name: "Messages" });
    await expect(messages.getByRole("listitem").filter({ hasText: `E2E-LIMIT-${id}-lines` })).toHaveCount(1);
    await expect(messages.getByRole("listitem").filter({ hasText: `E2E-LIMIT-${id}-kana` })).toHaveCount(1);

    // 4. The page states the limit; the browser keeps a longer text to the same number (the server's 422 above it is a unit test)
    await page.goto("/contact");
    await expect(page.getByText(`Up to ${STATED}.`, { exact: false })).toBeVisible();
    await box.fill(message(`E2E-LIMIT-${id}-over`, "Order 1234", LIMIT + 1));
    expect(await box.evaluate((el: HTMLTextAreaElement) => el.value.length)).toBe(LIMIT);
  });
});
