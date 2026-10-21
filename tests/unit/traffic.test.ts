// Traffic export (template-only): merging GitHub's 14-day window into CSV files, and the flow with a fake GitHub API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DAILY_HEADER, PATHS_HEADER, expiresSoon, failureReason, mergeDaily, mergeSnapshot, parseCsv, parseExpiry, toCsv } from "../../scripts/traffic/lib.ts";

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
  const csv = toCsv(["a", "b"], [['say "hi", ok', "=HYPERLINK(1)"], ["two\nlines", "-1"], ["\t=cmd", "\r=cmd"], ["+1", "@SUM(1)"]]);
  assert.deepEqual(parseCsv(csv), [
    ['say "hi", ok', "'=HYPERLINK(1)"],
    ["two\nlines", "'-1"],
    ["'\t=cmd", "'\r=cmd"],
    ["'+1", "'@SUM(1)"],
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

test("alert texts: the reason says what to do; expiry is read from GitHub's header", () => {
  assert.match(failureReason("missing"), /not set/);
  assert.match(failureReason(401), /expired or was revoked/);
  assert.match(failureReason(403), /Administration: Read-only/);
  const expiry = parseExpiry("2026-11-10 20:00:00 UTC");
  assert.equal(expiry?.toISOString(), "2026-11-10T20:00:00.000Z");
  assert.equal(parseExpiry(null), null);
  assert.equal(parseExpiry("soon"), null);
  const now = new Date("2026-10-21T00:00:00Z");
  assert.equal(expiresSoon(expiry, now), 20);
  assert.equal(expiresSoon(new Date("2027-10-21T00:00:00Z"), now), null, "far from expiring: no warning");
});

test("alert flow: a failed export opens one issue, a second failure updates it, a good run closes it; expiry warns", async () => {
  let trafficStatus = 401;
  let expiryHeader = "";
  const issues: Array<{ number: number; title: string; body: string; state: string; user: { login: string }; html_url: string }> = [];
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const url = req.url ?? "";
      calls.push(`${req.method} ${url.replace(/\?.*/, "")}`);
      const send = (code: number, out: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(code, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify(out));
      };
      if (url.includes("/traffic/")) {
        if (trafficStatus !== 200) return send(trafficStatus, { message: "Bad credentials" });
        const out = url.includes("views") ? { views: [] } : url.includes("clones") ? { clones: [] } : [];
        return send(200, out, expiryHeader ? { "github-authentication-token-expiration": expiryHeader } : {});
      }
      if (url.startsWith("/repos/o/r/issues?")) return send(200, issues.filter((i) => i.state === "open"));
      if (req.method === "POST" && url === "/repos/o/r/issues") {
        const b = JSON.parse(raw) as { title: string; body: string };
        const issue = { number: issues.length + 1, ...b, state: "open", user: { login: "github-actions[bot]" }, html_url: `i${issues.length + 1}` };
        issues.push(issue);
        return send(201, issue);
      }
      const m = /^\/repos\/o\/r\/issues\/(\d+)$/.exec(url);
      if (m && req.method === "PATCH") {
        const issue = issues.find((i) => i.number === Number(m[1]));
        Object.assign(issue ?? {}, JSON.parse(raw));
        return send(200, issue);
      }
      send(201, {});
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const dir = mkdtempSync(join(tmpdir(), "traffic-alert-"));
  const alertFile = join(dir, "alert.json");
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: "o/r",
    GITHUB_TOKEN: "workflow-token",
    GITHUB_RUN_ID: "42",
    TRAFFIC_ALERT_FILE: alertFile,
    GITHUB_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  };
  const run = (script: string, args: string[], extra: Record<string, string> = {}) =>
    promisify(execFile)("node", [`scripts/traffic/${script}`, ...args], { env: { ...env, ...extra } }).then(
      (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? 1, out: e.stdout ?? "", err: e.stderr ?? "" }),
    );
  // One workflow run: export, then the alert step for its outcome (the alert file starts empty on each run).
  const weeklyRun = async (tokenValue = "fake") => {
    rmSync(alertFile, { force: true });
    const exported = await run("run.ts", ["--out", join(dir, "data")], { TRAFFIC_TOKEN: tokenValue });
    const alerted = await run("alert.ts", ["--status", exported.code === 0 ? "success" : "failure"]);
    assert.equal(alerted.code, 0, alerted.err);
    return exported;
  };
  try {
    const expired = await weeklyRun();
    assert.equal(expired.code, 1, "the run turns red");
    assert.match(expired.err, /::error::Traffic export failed\. `TRAFFIC_TOKEN` was rejected \(HTTP 401\): it has expired/);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.title, /Traffic export failed/);
    assert.match(issues[0]!.body, /expired or was revoked/);
    assert.match(issues[0]!.body, /gh secret set TRAFFIC_TOKEN/);
    assert.match(issues[0]!.body, /actions\/runs\/42/);

    const missing = await weeklyRun("");
    assert.equal(missing.code, 1);
    assert.equal(issues.length, 1, "the same issue is updated, not a new one");
    assert.match(issues[0]!.body, /is not set/);
    assert.ok(calls.includes("POST /repos/o/r/issues/1/comments"), "a comment notifies the owner");

    trafficStatus = 200;
    const fixed = await weeklyRun();
    assert.equal(fixed.code, 0, fixed.err);
    assert.equal(issues[0]!.state, "closed", "a good run closes the alert");

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 19).replace("T", " ") + " UTC";
    expiryHeader = soon;
    const warned = await weeklyRun();
    assert.equal(warned.code, 0, "still green: the data was saved");
    assert.match(warned.out, /::warning::TRAFFIC_TOKEN expires in \d+ day/);
    assert.equal(issues.length, 2);
    assert.match(issues[1]!.title, /TRAFFIC_TOKEN expires in \d+ day/);
    assert.ok(existsSync(join(dir, "data", "views.csv")));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
