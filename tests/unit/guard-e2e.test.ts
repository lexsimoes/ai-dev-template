// End-to-end guard: selectors may change, what a test checks may not (without the owner's test-approved),
// and nothing is ever skipped. The CI flow runs the script on a temporary repository with a fake GitHub API.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertions, testTitles, weakened } from "../../scripts/guard-e2e.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/guard-e2e.ts");

const SPEC = `import { test, expect } from "./fixtures.ts";

test("CA-02: a valid coupon lowers the total", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("$50.00");
  await page.getByLabel("Discount code").fill("WELCOME10");
  await expect(page.getByTestId("total")).toHaveText("$45.00");
  expect(page.url()).not.toContain("error");
});
`;

test("assertions: the matcher and expected values count, the subject does not", () => {
  assert.deepEqual(assertions(SPEC), ['expect().toHaveText("$50.00")', 'expect().toHaveText("$45.00")', 'expect().not.toContain("error")']);
  assert.deepEqual(assertions('await expect.soft(\n  page.locator("a(b)"),\n).toHaveCount( 2 );'), ["expect.soft().toHaveCount(2)"]);
  assert.deepEqual(assertions("await expect(page).toHaveURL(/\\/checkout\\?x=(1)$/);"), ["expect().toHaveURL(/\\/checkout\\?x=(1)$/)"]);
  assert.deepEqual(testTitles(SPEC), ["CA-02: a valid coupon lowers the total"]);
});

test("weakened: a selector change passes; a changed value, a removed assertion or a renamed test does not", () => {
  const selector = SPEC.replaceAll('getByTestId("total")', 'getByRole("status", { name: "Total" })');
  assert.deepEqual(weakened(SPEC, selector), []);
  assert.deepEqual(weakened(SPEC, SPEC.replace('"$45.00"', '"$50.00"')), ['assertion changed or removed: `expect().toHaveText("$45.00")`']);
  assert.deepEqual(weakened(SPEC, SPEC.replace('  expect(page.url()).not.toContain("error");\n', "")), ['assertion changed or removed: `expect().not.toContain("error")`']);
  assert.match(weakened(SPEC, SPEC.replace("CA-02: a valid", "CA-02: any")).join("\n"), /test removed or renamed/);
  // Adding a test or an assertion is fine.
  assert.deepEqual(weakened(SPEC, `${SPEC}\ntest("CA-03: more", async () => { expect(1).toBe(1); });\n`), []);
});

let repo = "";
let server: http.Server;
let port = 0;
let labeler = "owner";

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

function write(files: Record<string, string | null>): void {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) rmSync(join(repo, path));
    else {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
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

/** Starts the PR branch again from main, with these changes. */
function pr(files: Record<string, string | null>): void {
  git("checkout", "-q", "main");
  git("checkout", "-qB", "pr");
  write(files);
}

before(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ event: "labeled", label: { name: "test-approved" }, actor: { login: labeler }, created_at: "t" }]));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
  repo = mkdtempSync(join(tmpdir(), "guard-e2e-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write({
    ".github/CODEOWNERS": "/tests/invariants/ @Owner\n",
    "e2e/coupon.spec.ts": SPEC,
    "e2e/fixtures.ts": "export const isolated = true;\n",
    "playwright.config.ts": "export default {};\n",
  });
  git("update-ref", "refs/remotes/origin/main", "HEAD");
});

after(() => {
  server.close();
  rmSync(repo, { recursive: true, force: true });
});

test("guard: a selector change and a new test pass without any label", async () => {
  pr({
    "e2e/coupon.spec.ts": SPEC.replaceAll('getByTestId("total")', 'getByRole("status", { name: "Total" })'),
    "e2e/inbox.spec.ts": 'import { test, expect } from "./fixtures.ts";\ntest("CA-03: inbox", async () => { expect(1).toBe(1); });\n',
  });
  const r = await guard([]);
  assert.equal(r.code, 0, r.out);
});

test("guard: a changed expected value fails without the label, passes with the owner's", async () => {
  pr({ "e2e/coupon.spec.ts": SPEC.replace('"$45.00"', '"$50.00"') });
  const without = await guard([]);
  assert.equal(without.code, 1);
  assert.match(without.out, /assertion changed or removed: `expect\(\)\.toHaveText\("\$45\.00"\)`, without a valid `test-approved` label/);
  labeler = "Owner";
  const owner = await guard(["test-approved"]);
  assert.equal(owner.code, 0, owner.out);
  assert.match(owner.out, /applied by @Owner/);
  labeler = "agent-bot";
  const agent = await guard(["test-approved"]);
  assert.equal(agent.code, 1);
  assert.match(agent.out, /applied by @agent-bot, who is not an owner \(@owner\)/);
  labeler = "owner";
});

test("guard: a deleted spec, or a change to the isolation or the config, needs the label", async () => {
  pr({ "e2e/coupon.spec.ts": null });
  assert.match((await guard([])).out, /`e2e\/coupon\.spec\.ts` deleted/);
  pr({ "e2e/fixtures.ts": "export const isolated = false;\n", "playwright.config.ts": "export default { retries: 9 };\n" });
  const r = await guard([]);
  assert.equal(r.code, 1);
  assert.match(r.out, /`e2e\/fixtures\.ts` changed \(isolation or run setup\)/);
  assert.match(r.out, /`playwright\.config\.ts` changed/);
});

test("guard: skipping, focusing or fixme fails even with the owner's label", async () => {
  for (const marker of ["test.skip", "test.fixme", "test.only", "test.describe.skip", "test.fail"]) {
    pr({ "e2e/coupon.spec.ts": SPEC.replace('test("CA-02', `${marker}("CA-02`) });
    labeler = "Owner";
    const r = await guard(["test-approved"]);
    assert.equal(r.code, 1, marker);
    assert.match(r.out, /skips, focuses or switches off a test/, marker);
  }
  labeler = "owner";
});
