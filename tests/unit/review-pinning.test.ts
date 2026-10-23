// Pinned model versions (scripts/review/providers.ts): what a provider lists before a call, and what a reply may be.
// The end-to-end flow (no call when an alias moves, a redirected reply discarded) is in review-flow.test.ts.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { listedVersion, versionProblem } from "../../scripts/review/providers.ts";
import type { Tier } from "../../scripts/review/lib.ts";

let server: http.Server;
let base = "";
let status = 200;
let models: unknown = { data: [{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" }] };

before(async () => {
  server = http.createServer((_req, res) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(models)));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

const prices = { input: 1, output: 1 };
const deepseek = (): Tier => ({ provider: "openai-compatible", baseUrl: base, model: "deepseek-v4-pro", pinnedVersion: "DeepSeek-V4-Pro", apiKeyEnv: "K", pricePerMTok: prices });
const claude: Tier = { provider: "anthropic", model: "claude-sonnet-5-5", pinnedVersion: "claude-sonnet-5-5", apiKeyEnv: "K", pricePerMTok: prices };

test("listedVersion: the name the provider lists for the model; an error or a missing model is never taken as a match", async () => {
  assert.equal(await listedVersion(deepseek(), "k", 5000), "DeepSeek-V4-Pro");
  status = 500;
  await assert.rejects(listedVersion(deepseek(), "k", 5000), /could not read the provider's model list \(HTTP 500\)/);
  status = 200;
  models = { data: [{ id: "deepseek-flash", name: "DeepSeek-V4.1-Flash" }] };
  await assert.rejects(listedVersion(deepseek(), "k", 5000), /no longer lists `deepseek-v4-pro`/);
  models = { data: [{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" }] };
  assert.equal(await listedVersion(claude, "k", 5000), "claude-sonnet-5-5", "Anthropic ids name one model: no list call");
});

test("versionProblem: the pinned model or its dated id passes; another model, a longer name or a fallback does not", () => {
  assert.equal(versionProblem(deepseek(), "DeepSeek-V4-Pro", "deepseek-v4-pro"), null);
  assert.equal(versionProblem(deepseek(), "DeepSeek-V4-Pro", "deepseek-v4-pro-20261017"), null, "a dated id of the alias");
  assert.match(versionProblem(deepseek(), "DeepSeek-V4.1-Pro") ?? "", /now serves `DeepSeek-V4.1-Pro` behind `deepseek-v4-pro`/);
  assert.match(versionProblem(deepseek(), "DeepSeek-V4-Pro", "deepseek-v4-pro-max") ?? "", /reply came from `deepseek-v4-pro-max`/);
  assert.equal(versionProblem(claude, "claude-sonnet-5-5", "claude-sonnet-5-5"), null);
  assert.equal(versionProblem(claude, "claude-sonnet-5-5", "claude-sonnet-5-5-20260601"), null);
  assert.equal(versionProblem(claude, "claude-sonnet-5-5", "claude-sonnet-5-5-2026-06-01"), null);
  const older = { ...claude, model: "claude-sonnet-5", pinnedVersion: "claude-sonnet-5" };
  assert.match(versionProblem(older, "claude-sonnet-5", "claude-sonnet-5-5") ?? "", /reply came from `claude-sonnet-5-5`/, "a version number is another model, not a date");
  assert.match(versionProblem(claude, "claude-sonnet-5-5", "claude-opus-5-5") ?? "", /reply came from `claude-opus-5-5`.*fallback/s, "a server-side fallback is not the pinned model");
  assert.equal(versionProblem({ ...claude, pinnedVersion: undefined }, "claude-sonnet-5-5", "anything"), null, "an unpinned tier is not checked");
});
