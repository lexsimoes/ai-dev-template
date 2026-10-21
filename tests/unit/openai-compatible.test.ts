import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createOpenAICompatibleClient } from "../../src/ai/providers/openai-compatible.ts";

function server(handler: (body: Record<string, unknown>, auth: string) => [number, unknown]): Promise<{ url: string; close: () => void }> {
  const s = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const [code, out] = handler(JSON.parse(body || "{}") as Record<string, unknown>, String(req.headers.authorization));
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((ok) => s.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(s.address() as { port: number }).port}`, close: () => s.close() })));
}

test("openai-compatible: sends model, extras and key; returns text and tokens", async () => {
  let seen: Record<string, unknown> = {};
  let auth = "";
  const srv = await server((body, a) => {
    seen = body;
    auth = a;
    return [200, { model: "m1", choices: [{ message: { content: "oi" } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }];
  });
  const client = createOpenAICompatibleClient({ baseUrl: srv.url, model: "m1", apiKey: "fake-key", extraBody: { reasoning_effort: "none" } });
  const r = await client.complete({ system: "s", user: "u" });
  srv.close();
  assert.deepEqual([r.text, r.inputTokens, r.outputTokens], ["oi", 12, 3]);
  assert.equal(seen.reasoning_effort, "none");
  assert.equal(seen.model, "m1");
  assert.equal(auth, "Bearer fake-key");
});

test("openai-compatible: HTTP error does not expose the key", async () => {
  const srv = await server(() => [401, { error: "invalid key" }]);
  const client = createOpenAICompatibleClient({ baseUrl: srv.url, model: "m1", apiKey: "k-fake-9" });
  await assert.rejects(client.complete({ system: "s", user: "u" }), (e: Error) => /HTTP 401/.test(e.message) && !e.message.includes("k-fake-9"));
  srv.close();
});

test("openai-compatible: a cut reply or one without text is an error, not empty text", async () => {
  for (const [choices, re] of [
    [[{ message: { content: "{\"categ" }, finish_reason: "length" }], /output token limit/],
    [[{ message: { content: null }, finish_reason: "stop" }], /returned no text/],
    [[{ message: { content: "  " }, finish_reason: "stop" }], /returned no text/],
    [[], /returned no text/],
  ] as const) {
    const srv = await server(() => [200, { choices }]);
    const client = createOpenAICompatibleClient({ baseUrl: srv.url, model: "m1", apiKey: "k" });
    try {
      await assert.rejects(client.complete({ system: "s", user: "u" }), re);
    } finally {
      srv.close(); // without this, a failing test leaves the server open and hangs the run
    }
  }
});

test("openai-compatible: missing config gives a clear error", () => {
  assert.throws(() => createOpenAICompatibleClient({ baseUrl: "", model: "m", apiKey: "k" }), /LLM_BASE_URL/);
});
