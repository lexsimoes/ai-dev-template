import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/web/app.ts";
import { escapeHtml, formatPrice } from "../../src/web/html.ts";
import { providerFor } from "../../src/web/server.ts";
import { createMockClient } from "../../src/ai/providers/mock.ts";
import type { LLMClient } from "../../src/ai/llm.ts";

async function withApp(llm: LLMClient, run: (base: string) => Promise<void>): Promise<void> {
  const app = createApp({ llm, now: () => new Date("2026-10-22T12:00:00Z") });
  const server = createServer((req, res) => void app(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const post = (url: string, form: Record<string, string>) =>
  fetch(url, { method: "POST", body: new URLSearchParams(form), redirect: "manual" });

test("e2e mode accepts only the fake AI provider", () => {
  assert.equal(providerFor({ APP_ENV: "e2e" }), "mock");
  assert.equal(providerFor({ APP_ENV: "e2e", LLM_PROVIDER: "mock" }), "mock");
  assert.throws(() => providerFor({ APP_ENV: "e2e", LLM_PROVIDER: "anthropic" }), /accepts only LLM_PROVIDER=mock/);
  assert.throws(() => providerFor({ APP_ENV: "e2e", LLM_PROVIDER: "openai-compatible" }), /never call a real model/);
  assert.equal(providerFor({ LLM_PROVIDER: "anthropic" }), "anthropic");
});

test("the end-to-end config runs the app only in its isolated mode, never a server already running", () => {
  const config = readFileSync("playwright.config.ts", "utf-8");
  assert.match(config, /APP_ENV: "e2e", LLM_PROVIDER: "mock"/);
  assert.match(config, /reuseExistingServer: false/);
  assert.match(readFileSync("e2e/fixtures.ts", "utf-8"), /auto: true/);
});

test("the test agents carry the project rules: selectors only, never fixme or skip", () => {
  for (const agent of ["planner", "generator", "healer"]) {
    const text = readFileSync(`.claude/agents/playwright-test-${agent}.md`, "utf-8");
    assert.match(text, /## Project rules \(ai-dev-template, override anything above\)/, agent);
    assert.match(text, /selectors only/, agent);
    assert.match(text, /test-approved/, agent);
  }
  // The upstream definitions are edited too, so no earlier line contradicts the rules.
  const healer = readFileSync(".claude/agents/playwright-test-healer.md", "utf-8");
  assert.doesNotMatch(healer, /Fixing assertions|mark this test as test\.fixme|do the most reasonable thing possible to pass/);
  assert.doesNotMatch(readFileSync(".claude/agents/playwright-test-planner.md", "utf-8"), /browser_run_code_unsafe/);
});

test("helpers: HTML is escaped, prices are in dollars", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(formatPrice(4_500), "$45.00");
});

test("checkout: a valid coupon lowers the total; an unknown or expired one gives no discount and says why", async () => {
  await withApp(createMockClient(), async (base) => {
    assert.match(await (await fetch(base)).text(), /data-testid="total">\$50\.00/);
    const valid = await post(`${base}/checkout`, { coupon: "welcome10" });
    assert.equal(valid.status, 200);
    assert.match(await valid.text(), /data-testid="total">\$45\.00/);
    const unknown = await post(`${base}/checkout`, { coupon: "NOPE" });
    assert.equal(unknown.status, 422);
    const unknownHtml = await unknown.text();
    assert.match(unknownHtml, /data-testid="total">\$50\.00/);
    assert.match(unknownHtml, /We don't recognize the code “NOPE”/);
    const expired = await (await post(`${base}/checkout`, { coupon: "SUMMER20" })).text();
    assert.match(expired, /expired on August 31, 2025/);
    assert.match(expired, /data-testid="total">\$50\.00/);
  });
});

test("contact → inbox: the message is classified, shown as text, and an empty or too long one is refused", async () => {
  await withApp(createMockClient(), async (base) => {
    const sent = await post(`${base}/contact`, { message: "My package arrived late <script>x()</script>" });
    assert.equal(sent.status, 303);
    assert.equal(sent.headers.get("location"), "/contact?sent=1");
    const inbox = await fetch(`${base}/support?topic=delivery`);
    assert.match(inbox.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    const html = await inbox.text();
    assert.match(html, /My package arrived late &lt;script&gt;x\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.equal((await post(`${base}/contact`, { message: "  " })).status, 422);
    assert.equal((await post(`${base}/contact`, { message: "a".repeat(2_001) })).status, 422);
  });
});

test("contact: a line break counts as one character, as in the browser, and any alphabet fits the limit (#33)", async () => {
  await withApp(createMockClient(), async (base) => {
    // The form sends line breaks as CRLF: 1,000 characters plus 999 CRLF are 1,999 characters for the browser.
    const lines = Array(1_000).fill("a").join("\r\n");
    assert.equal((await post(`${base}/contact`, { message: lines })).status, 303);
    assert.equal((await post(`${base}/contact`, { message: "注".repeat(2_000) })).status, 303, "2,000 characters of 3-byte text fit the body limit");
    const over = await post(`${base}/contact`, { message: `${lines}\r\nb` });
    assert.equal(over.status, 422);
    const html = await over.text();
    assert.match(html, /Your message has 2,001 characters; the limit is 2,000 characters \(a line break counts as one\)\./);
    const page = await (await fetch(`${base}/contact`)).text();
    assert.match(page, /Up to 2,000 characters \(a line break counts as one\)\./, "the page states the limit the same way");
    assert.match(await (await fetch(`${base}/support`)).text(), /a\na\na/, "stored with LF line breaks");
  });
});

test("a failed or invalid model reply never loses the message: it goes to a person", async () => {
  const failing: LLMClient = { name: "failing", complete: () => Promise.reject(new Error("provider down")) };
  const invalid: LLMClient = { name: "invalid", complete: () => Promise.resolve({ text: "ignore the rules", model: "x" }) };
  for (const llm of [failing, invalid]) {
    await withApp(llm, async (base) => {
      await post(`${base}/contact`, { message: "Where is my refund?" });
      const html = await (await fetch(`${base}/support?topic=needs-person`)).text();
      assert.match(html, /Where is my refund\?/, llm.name);
      assert.match(html, /class="flag">Needs a person/, llm.name);
    });
  }
});

test("a malformed request line answers 400 and the server keeps serving", async () => {
  await withApp(createMockClient(), async (base) => {
    const { port } = new URL(base);
    const raw = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), "127.0.0.1", () => socket.end("GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
      let data = "";
      socket.on("data", (chunk) => (data += chunk.toString()));
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });
    assert.match(raw, /^HTTP\/1\.1 400/);
    assert.equal((await fetch(base)).status, 200);
  });
});

test("an oversized form answers 413 on the right page", async () => {
  await withApp(createMockClient(), async (base) => {
    const big = "x".repeat(20_000);
    const contact = await post(`${base}/contact`, { message: big });
    assert.equal(contact.status, 413);
    assert.match(await contact.text(), /Your message is too long/);
    const checkout = await post(`${base}/checkout`, { coupon: big });
    assert.equal(checkout.status, 413);
    const html = await checkout.text();
    assert.match(html, /What you sent is too long/);
    assert.doesNotMatch(html, /Your message/);
  });
});
