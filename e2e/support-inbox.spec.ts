// spec: specs/e2e/critical-flows.md
// seed: e2e/seed.spec.ts

import { test, expect } from "./fixtures.ts";

test.describe("Support inbox", () => {
  test("CA-03: a Contact us message appears in the Support inbox with a topic from the closed list", async ({ page }) => {
    const mainNav = page.getByRole("navigation", { name: "Main" });
    const messages = page.getByRole("region", { name: "Messages" });
    // Unique per run: the app keeps messages in memory for the whole test run (and its retries).
    const text = `E2E-CA03-${crypto.randomUUID().slice(0, 8)} my package is late, tracking shows nothing`;

    // 1. Go to /support and check the heading
    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Support inbox", level: 1 })).toBeVisible();

    // 2. Go to Contact us, write a unique message and send it
    await mainNav.getByRole("link", { name: "Contact us" }).click();
    await expect(page.getByRole("heading", { name: "Contact us", level: 1 })).toBeVisible();
    await page.getByRole("textbox", { name: "Your message" }).fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page).toHaveURL(/\/contact\?sent=1$/);
    await expect(page.getByRole("status")).toHaveText(
      "Thanks, we got your message. Our team replies within one business day.",
    );

    // 3. Open the Support inbox and check the message and its topic label
    await mainNav.getByRole("link", { name: "Support inbox" }).click();
    const item = messages.getByRole("listitem").filter({ hasText: text });
    await expect(item).toBeVisible();
    await expect(item).toContainText(/Just now|\d+ min ago/);
    const label = item.getByText(/^(Exchange|Delivery|Payment|Other)$/);
    await expect(label).toHaveCount(1);
    await expect(page.getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");

    // 4. Click the filter matching the topic label
    const topicLabel = (await label.innerText()).trim();
    const topic = topicLabel.toLowerCase();
    await page.getByRole("navigation", { name: "Topics" }).getByRole("link", { name: topicLabel, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/support\\?topic=${topic}$`));
    await expect(messages.getByRole("listitem").filter({ hasText: text })).toBeVisible();

    // 5. Empty and whitespace-only messages are rejected and not added to the inbox
    await page.goto("/support");
    const countBefore = await messages.getByRole("listitem").count();
    for (const invalid of ["", "   "]) {
      await page.goto("/contact");
      await page.getByRole("textbox", { name: "Your message" }).fill(invalid);
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/contact") && r.request().method() === "POST"),
        page.getByRole("button", { name: "Send message" }).click(),
      ]);
      expect(response.status()).toBe(422);
      await expect(page.getByRole("alert")).toHaveText("Write a message before sending it.");
    }
    await page.goto("/support");
    await expect(messages.getByRole("listitem")).toHaveCount(countBefore);
  });
});
