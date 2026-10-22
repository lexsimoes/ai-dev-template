// End-to-end guard: in an existing spec only selectors may change without the owner's test-approved, and nothing
// is ever skipped. Every bypass found by the security review is planted here. The CI flow runs the script on a
// temporary repository with a fake GitHub API.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { newSpecProblems, normalize, skeleton } from "../../scripts/guard-e2e.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/guard-e2e.ts");

const SPEC = `import { test, expect } from "./fixtures.ts";

test("CA-02: a valid coupon lowers the total", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("$50.00");
  await page.getByLabel("Discount code").fill("WELCOME10");
  const response = await page.request.get("/");
  expect(response.status()).toBe(200);
  await expect(page.getByTestId("total")).toHaveText("$45.00");
});
`;

test("normalize: comments, whitespace and trailing commas do not count; strings do", () => {
  assert.equal(normalize("a ( b , ) // c\n/* d */ 'x  y'"), "a(b)'x  y'");
  assert.equal(normalize("return x"), "return x");
});

test("skeleton: a selector change, reformatting or a comment keep the same skeleton", () => {
  const variants = [
    SPEC.replaceAll('page.getByTestId("total")', 'page.getByRole("status", { name: "Total" }).first()'),
    SPEC.replace('page.getByLabel("Discount code")', 'summary.locator("form").getByRole("textbox").nth(0)'),
    SPEC.replaceAll("  ", "    ").replace("await page.goto", "// open the page\n  await page.goto"),
  ];
  for (const v of variants) assert.equal(skeleton(v), skeleton(SPEC));
});

test("skeleton: anything that is not a selector changes the skeleton (the review's bypasses)", () => {
  const weakened = {
    "commented assertion": SPEC.replace('await expect(page.getByTestId("total")).toHaveText("$45.00");', '// await expect(page.getByTestId("total")).toHaveText("$45.00");'),
    "commented test": `import { test, expect } from "./fixtures.ts";\n/*\n${SPEC.split("\n").slice(1).join("\n")}*/\n`,
    "changed value": SPEC.replace('"$45.00"', '"$50.00"'),
    "early return": SPEC.replace('await page.goto("/");', 'return;\n  await page.goto("/");'),
    "swallowed failures": SPEC.replace('await page.goto("/");', 'try { await page.goto("/");').replace('toHaveText("$45.00");', 'toHaveText("$45.00"); } catch {}'),
    "fake library": SPEC.replace('"./fixtures.ts"', '"./helpers.ts"'),
    "isolation removed": SPEC.replace('await page.goto("/");', 'await page.context().unrouteAll();\n  await page.goto("/");'),
    "trivial subject": SPEC.replace("expect(response.status())", "expect(200)"),
  };
  for (const [name, source] of Object.entries(weakened)) assert.notEqual(skeleton(source), skeleton(SPEC), name);
});

test("new spec: only ./fixtures.ts imports, no routing, mocking or reconfiguring", () => {
  assert.deepEqual(newSpecProblems(SPEC), []);
  assert.match(newSpecProblems(SPEC.replace('"./fixtures.ts"', '"./helpers.ts"')).join(), /imports `\.\/helpers\.ts`/);
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', 'await page.route("**", (r) => r.fulfill({ body: "" }));')).join(), /routes, mocks/);
  assert.match(newSpecProblems(`${SPEC}\ntest.use({ baseURL: "https://example.com" });\n`).join(), /reconfigures/);
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
  git("-c", "commit.gpgsign=false", "commit", "-qm", "c", "--allow-empty");
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

test("guard: a selector change and a clean new spec pass without any label", async () => {
  pr({
    "e2e/coupon.spec.ts": SPEC.replaceAll('page.getByTestId("total")', 'page.getByRole("status", { name: "Total" })'),
    "e2e/inbox.spec.ts": 'import { test, expect } from "./fixtures.ts";\ntest("CA-03: inbox", async ({ page }) => { await page.goto("/support"); await expect(page).toHaveTitle(/Support/); });\n',
  });
  const r = await guard([]);
  assert.equal(r.code, 0, r.out);
});

test("guard: a weakened spec fails without the label, passes with the owner's, fails with a non-owner's", async () => {
  pr({ "e2e/coupon.spec.ts": SPEC.replace('await page.goto("/");', 'return;\n  await page.goto("/");') });
  const without = await guard([]);
  assert.equal(without.code, 1);
  assert.match(without.out, /`e2e\/coupon\.spec\.ts` changes more than selectors: `…[^`]*` became `…[^`]*return;/);
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

test("guard: deleting a spec, adding a helper, or touching the fixtures or the config needs the label", async () => {
  pr({ "e2e/coupon.spec.ts": null });
  assert.match((await guard([])).out, /`e2e\/coupon\.spec\.ts` deleted or renamed/);
  pr({ "e2e/helpers.ts": "export const expect = () => ({ toHaveText: () => undefined });\n" });
  assert.match((await guard([])).out, /`e2e\/helpers\.ts` added/);
  pr({ "e2e/fixtures.ts": "export const isolated = false;\n", "playwright.config.ts": "export default { retries: 9 };\n" });
  const r = await guard([]);
  assert.equal(r.code, 1);
  assert.match(r.out, /`e2e\/fixtures\.ts` changed/);
  assert.match(r.out, /`playwright\.config\.ts` changed/);
  pr({ "e2e/mocked.spec.ts": SPEC.replace('await page.goto("/");', 'await page.route("**", (r) => r.fulfill({ body: "" }));') });
  assert.match((await guard([])).out, /new `e2e\/mocked\.spec\.ts` routes, mocks or reconfigures/);
});

test("guard: skipping, focusing or fixme fails even with the owner's label, in any form", async () => {
  const forms = {
    "test.skip": SPEC.replace('test("CA-02', 'test.skip("CA-02'),
    "test.only": SPEC.replace('test("CA-02', 'test.only("CA-02'),
    "describe split over lines": `${SPEC}\ntest.describe\n  .skip("x", () => {});\n`,
    "bracket access": `${SPEC}\ntest.describe["fixme"]("x", () => {});\n`,
    "testInfo.skip": SPEC.replace("async ({ page }) => {", "async ({ page }, testInfo) => {\n  testInfo.skip();"),
    "test.step.skip": SPEC.replace('await page.goto("/");', 'await test.step.skip("all", async () => { await page.goto("/"); });'),
    "test.fail": SPEC.replace('test("CA-02', 'test.fail("CA-02'),
  };
  labeler = "Owner";
  for (const [name, source] of Object.entries(forms)) {
    pr({ "e2e/coupon.spec.ts": source });
    const r = await guard(["test-approved"]);
    assert.equal(r.code, 1, name);
    assert.match(r.out, /skips, focuses or switches off a test/, name);
  }
  pr({ "e2e/widget.spec.tsx": 'import { test } from "./fixtures.ts";\ntest.skip("x", () => {});\n' });
  assert.match((await guard(["test-approved"])).out, /`e2e\/widget\.spec\.tsx` skips/, ".tsx files are checked too");
  labeler = "owner";
});
