// Invariant guard: who can approve (CODEOWNERS) and the CI flow with a fake GitHub API.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { isLabeled, lastLabeler, ownersOf } from "../../scripts/guard-invariants.ts";
import type { IssueEvent } from "../../scripts/guard-invariants.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/guard-invariants.ts");
const CODEOWNERS = "# comment\n*  @everyone\n/tests/invariants/   @Owner  @org/team\n/evals/ @other\n";

test("CODEOWNERS: the last matching rule wins; teams are left out", () => {
  assert.deepEqual(ownersOf(CODEOWNERS, "tests/invariants/"), ["owner"]);
  assert.deepEqual(ownersOf(CODEOWNERS, "src/x.ts"), ["everyone"]);
  assert.deepEqual(ownersOf("", "tests/invariants/"), []);
  assert.deepEqual(ownersOf("/tests/invariants @no-slash\n", "tests/invariants/"), ["no-slash"], "a folder without a trailing slash also counts");
  assert.deepEqual(ownersOf("/tests/inv @other\n", "tests/invariants/"), [], "a name prefix is not a folder");
});

test("label: whoever applied it last counts", () => {
  const ev = (event: string, login: string, name = "invariant-approved"): IssueEvent => ({ event, label: { name }, actor: { login }, created_at: "t" });
  assert.equal(lastLabeler([ev("labeled", "owner"), ev("unlabeled", "owner"), ev("labeled", "agent")], "invariant-approved"), "agent");
  assert.equal(lastLabeler([ev("labeled", "owner", "other")], "invariant-approved"), null);
  assert.equal(isLabeled([ev("labeled", "owner"), ev("unlabeled", "owner")], "invariant-approved"), false, "removal counts, even in a Re-run with the stale payload");
  assert.equal(isLabeled([ev("labeled", "owner"), ev("labeled", "owner", "other")], "invariant-approved"), true);
});

let repo = "";
let server: http.Server;
let port = 0;
let labeler = "owner";
let apiStatus = 200;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

function write(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "c");
}

async function guard(labels: string[]): Promise<{ code: number; out: string }> {
  try {
    const { stdout } = await run("node", [SCRIPT], {
      cwd: repo,
      env: {
        ...process.env,
        EVENT_NAME: "pull_request",
        BASE_REF: "main",
        PR_LABELS: JSON.stringify(labels),
        PR_NUMBER: "1",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_TOKEN: "fake",
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        GITHUB_STEP_SUMMARY: "",
      },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, out: err.stdout ?? "" };
  }
}

before(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(apiStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify(apiStatus === 200 ? [{ event: "labeled", label: { name: "invariant-approved" }, actor: { login: labeler }, created_at: "t" }] : {}));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
  repo = mkdtempSync(join(tmpdir(), "guard-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write({ ".github/CODEOWNERS": CODEOWNERS, "tests/invariants/a.test.ts": 'test("a", () => {});\ntest("b", () => {});\n' });
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "pr");
  write({ "tests/invariants/a.test.ts": 'test("a", () => {});\n' });
});

after(() => {
  server.close();
  rmSync(repo, { recursive: true, force: true });
});

test("guard: a change to the invariants without the label fails", async () => {
  const r = await guard([]);
  assert.equal(r.code, 1);
  assert.match(r.out, /without a valid `invariant-approved` label/);
});

test("guard: label applied by the CODEOWNERS owner passes", async () => {
  labeler = "Owner";
  const r = await guard(["invariant-approved"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /applied by @Owner/);
});

test("guard: label applied by a non-owner fails", async () => {
  labeler = "agent-bot";
  const r = await guard(["invariant-approved"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /applied by @agent-bot, who is not an owner/);
  assert.match(r.out, /dropped from 2 to 1/);
  labeler = "owner";
});

test("guard: in CI, failing to check who applied the label fails", async () => {
  apiStatus = 500;
  const r = await guard(["invariant-approved"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /Could not check/);
  apiStatus = 200;
});
