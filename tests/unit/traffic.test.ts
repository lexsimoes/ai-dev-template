// Traffic export (template-only): merging GitHub's 14-day window into CSV files, and the flow with a fake GitHub API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DAILY_HEADER, PATHS_HEADER, mergeDaily, mergeSnapshot, parseCsv, toCsv } from "../../scripts/traffic/lib.ts";

const day = (date: string, count: number, uniques = 1) => ({ timestamp: `${date}T00:00:00Z`, count, uniques });

test("daily: old days are kept, the window's days are updated (the last one is still being counted)", () => {
  const week1 = mergeDaily("", [day("2026-10-01", 3), day("2026-10-02", 1)]);
  const week2 = mergeDaily(week1, [day("2026-10-02", 5), day("2026-10-03", 2)]);
  assert.deepEqual(parseCsv(week2), [
    ["2026-10-01", "3", "1"],
    ["2026-10-02", "5", "1"],
    ["2026-10-03", "2", "1"],
  ]);
  assert.equal(week2.split("\n")[0], DAILY_HEADER.join(","));
});

test("snapshot: a run on the same day replaces its rows; earlier snapshots stay", () => {
  const a = mergeSnapshot("", PATHS_HEADER, "2026-10-05", [["/r", "Repo", "9", "4"]]);
  const b = mergeSnapshot(a, PATHS_HEADER, "2026-10-12", [["/r", "Repo", "7", "3"]]);
  const c = mergeSnapshot(b, PATHS_HEADER, "2026-10-12", [["/r", "Repo", "8", "3"]]);
  assert.deepEqual(parseCsv(c), [
    ["2026-10-05", "/r", "Repo", "9", "4"],
    ["2026-10-12", "/r", "Repo", "8", "3"],
  ]);
});

test("csv: titles from outside keep commas, quotes and line breaks, and never become a formula", () => {
  const csv = toCsv(["a", "b"], [['say "hi", ok', "=HYPERLINK(1)"], ["two\nlines", "-1"]]);
  assert.deepEqual(parseCsv(csv), [
    ['say "hi", ok', "'=HYPERLINK(1)"],
    ["two\nlines", "'-1"],
  ]);
});

test("flow: reads the 4 traffic endpoints with TRAFFIC_TOKEN and writes the CSV files; without the token it fails", async () => {
  const auth: string[] = [];
  const server = createServer((req, res) => {
    auth.push(req.headers.authorization ?? "");
    const url = req.url ?? "";
    const out = url.includes("/traffic/views")
      ? { views: [day("2026-10-20", 4, 2)] }
      : url.includes("/traffic/clones")
        ? { clones: [day("2026-10-20", 1, 1)] }
        : url.includes("/popular/paths")
          ? [{ path: "/o/r", title: "o/r: template", count: 4, uniques: 2 }]
          : [{ referrer: "github.com", count: 3, uniques: 2 }];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const dir = mkdtempSync(join(tmpdir(), "traffic-"));
  const env = { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  const run = promisify(execFile);
  try {
    await run("node", ["scripts/traffic/run.ts", "--out", dir], { env: { ...env, TRAFFIC_TOKEN: "fake" } });
    assert.equal(auth.length, 4);
    assert.ok(auth.every((a) => a === "Bearer fake"));
    assert.match(readFileSync(join(dir, "views.csv"), "utf-8"), /^2026-10-20,4,2$/m);
    assert.match(readFileSync(join(dir, "clones.csv"), "utf-8"), /^2026-10-20,1,1$/m);
    assert.match(readFileSync(join(dir, "paths.csv"), "utf-8"), /,\/o\/r,o\/r: template,4,2$/m);
    assert.match(readFileSync(join(dir, "referrers.csv"), "utf-8"), /,github\.com,3,2$/m);

    const noToken = await run("node", ["scripts/traffic/run.ts", "--out", dir], { env: { ...env, TRAFFIC_TOKEN: "" } }).then(
      () => ({ code: 0, err: "" }),
      (e: { code?: number; stderr?: string }) => ({ code: e.code ?? 1, err: e.stderr ?? "" }),
    );
    assert.equal(noToken.code, 1, "a missing token is an error, never an empty export");
    assert.match(noToken.err, /gh secret set TRAFFIC_TOKEN/);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
