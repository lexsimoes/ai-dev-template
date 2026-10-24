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
import { disableProblems, newSpecProblems, parse, quarantined, skeleton } from "../../scripts/guard-e2e.ts";

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

test("parse: the TypeScript parser reads the specs; a file that does not parse is never taken as unchanged", () => {
  assert.ok(parse(SPEC));
  assert.equal(parse("const x = (;"), null);
  assert.deepEqual(disableProblems("const x = (;"), ["does not parse"]);
  assert.notEqual(skeleton("const x = (;"), skeleton("const x = (;;"));
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
    // Second review: a regex ending in \/\/ read as a comment, and code hidden inside a locator argument.
    "regex hides the rest of the line": SPEC.replace('await page.goto("/");', 'await expect(page).toHaveURL(/\\/order\\//); return;\n  await page.goto("/");'),
    "code inside a locator argument": SPEC.replace('page.getByLabel("Discount code")', 'page.getByLabel((await page.context().unrouteAll(), "Discount code"))'),
    "callback inside a locator argument": SPEC.replace('page.getByLabel("Discount code")', 'page.getByLabel((() => { return "Discount code"; })())'),
    "optional call on a locator": SPEC.replace('page.getByLabel("Discount code")', 'page?.getByLabel("Discount code")'),
  };
  for (const [name, source] of Object.entries(weakened)) assert.notEqual(skeleton(source), skeleton(SPEC), name);
});

test("new spec: only ./fixtures.ts imports, no routing, mocking or reconfiguring", () => {
  assert.deepEqual(newSpecProblems(SPEC), []);
  assert.match(newSpecProblems(SPEC.replace('"./fixtures.ts"', '"./helpers.ts"')).join(), /imports "\.\/helpers\.ts"/);
  assert.match(newSpecProblems(SPEC.replace('"./fixtures.ts";', '"./fixtures.ts"\nimport { expect as e } from "@playwright/test"')).join(), /imports "@playwright\/test"/, "an import without a semicolon before it");
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', 'const pw = await import("@playwright/test");')).join(), /loads a module at run time/);
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', 'const fs = require("node:fs");')).join(), /loads a module at run time/);
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', 'await page.route("**", (r) => r.fulfill({ body: "" }));')).join(), /routes, mocks/);
  assert.match(newSpecProblems(`${SPEC}\ntest.use({ baseURL: "https://example.com" });\n`).join(), /reconfigures/);
  assert.match(newSpecProblems(`${SPEC}\ntest.beforeEach(async ({ page }) => { await page.goto("/"); });\n`).join(), /beforeEach/);
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', 'await page["route"]("**", (r) => r.abort());')).join(), /uses `route`/, "bracket access");
  assert.match(newSpecProblems(SPEC.replace('await page.goto("/");', "const { route } = page;")).join(), /uses `route`/, "destructuring");
});

test("disable: switching a test off is caught however it is written", () => {
  assert.deepEqual(disableProblems(SPEC), []);
  const forms = {
    "alias": `${SPEC}\nconst off = test.skip;\noff("x", () => {});\n`,
    "computed key": `${SPEC}\ntest["sk" + "ip"]("x", () => {});\n`,
    "quoted key": `${SPEC}\ntest.describe["fixme"]("x", () => {});\n`,
    "destructuring": `${SPEC}\nconst { only } = test;\n`,
    // The method names are interpolated so this file does not trip check-fix's line heuristic; the planted spec is the same.
    "regex before it": `${SPEC}\nconst r = /\\//; test.${"skip"}("x", () => {});\n`,
    "inside a template literal": `${SPEC}\nconst label = \`\${(test.${"fixme"}(), "x")}\`;\n`,
    "Reflect": `${SPEC}\nReflect.get(test, "sk" + "ip")("x", () => {});\n`,
    // Third review (the hand-written reader missed these; the parser does not):
    "a } inside a string in a template expression": `${SPEC}\nconst label = \`\${"}", test.${"skip"}("x", () => {})}\`;\n`,
    "a regex after )": `${SPEC}\nif (true) /\\//.test("x"); test.${"fixme"}("x", () => {});\n`,
    "optional computed access": `${SPEC}\nconst k = "sk" + "ip";\ntest?.[k]("x", () => {});\n`,
    "computed destructuring key": `${SPEC}\nconst k = "sk" + "ip";\nconst { [k]: off } = test;\n`,
    // Fourth review: the Function constructor reached through string keys builds a skip at run time.
    "constructor through string keys": `${SPEC}\ntest["constructor"]["constructor"]("t", "t['sk' + 'ip']('x', () => {})")(test);\n`,
  };
  for (const [name, source] of Object.entries(forms)) assert.notDeepEqual(disableProblems(source), [], name);
  // A TypeScript array type and a plain string key are not computed access.
  assert.deepEqual(disableProblems('const a: string[] = [];\nconst h = response.headers()["content-security-policy"];\n'), []);
});

let repo = "";
let server: http.Server;
let port = 0;
let labeler = "owner";
let issueState = "open";

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

async function guard(labels: string[], event = "pull_request", extra: Record<string, string> = {}, cwd = repo): Promise<{ code: number; out: string }> {
  try {
    const { stdout } = await run("node", [SCRIPT], {
      cwd,
      env: {
        ...process.env,
        EVENT_NAME: event,
        BASE_REF: "main",
        PR_LABELS: JSON.stringify(labels),
        PR_NUMBER: "1",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_TOKEN: "fake",
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        GITHUB_STEP_SUMMARY: "",
        // The parser comes from this repository's node_modules, as from the pinned install in CI.
        E2E_GUARD_MODULES: resolve("."),
        ...extra,
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
  server = http.createServer((req, res) => {
    const json = (status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    // /repos/o/r/issues/<n> is the quarantine issue; /repos/o/r/issues/1/events is the PR's label history.
    if (!/\/issues\/\d+$/.test(req.url ?? "")) json(200, [{ event: "labeled", label: { name: "test-approved" }, actor: { login: labeler }, created_at: "t" }]);
    else if (issueState === "missing") json(404, {});
    else if (issueState === "pull") json(200, { number: 7, state: "open", pull_request: {} });
    else json(200, { number: 7, state: issueState });
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
  assert.match(without.out, /`e2e\/coupon\.spec\.ts` changes more than selectors: `…[^`]*` became `…[^`]*ReturnStatement/);
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
  assert.match((await guard([])).out, /new `e2e\/mocked\.spec\.ts` uses `route` \(routes, mocks/);
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

test("guard: the tester's own files in e2e/ (an adopted project's package.json and lockfile) are protected; an ignored node_modules/ is not read", async () => {
  pr({ "e2e/package.json": '{ "devDependencies": { "@playwright/test": "9.9.9" } }\n' });
  const added = await guard([]);
  assert.equal(added.code, 1);
  assert.match(added.out, /`e2e\/package\.json` added/);

  // An installed (and ignored) node_modules/ next to the specs is never read as test code.
  pr({ "e2e/coupon.spec.ts": SPEC.replaceAll('page.getByTestId("total")', 'page.getByTestId("grand-total")') });
  mkdirSync(join(repo, "e2e/node_modules/pkg"), { recursive: true });
  writeFileSync(join(repo, "e2e/node_modules/pkg/index.js"), 'test.skip("x", () => {});\n');
  writeFileSync(join(repo, ".git/info/exclude"), "e2e/node_modules/\n");
  try {
    const clean = await guard([]);
    assert.equal(clean.code, 0, clean.out);
  } finally {
    rmSync(join(repo, "e2e/node_modules"), { recursive: true, force: true });
    writeFileSync(join(repo, ".git/info/exclude"), "");
  }
});

test("guard: a spec whose name git would quote (a quote, a backslash, a non-ASCII letter) is still read", async () => {
  const hidden = 'import { test } from "@playwright/test";\ntest.skip("x", async ({ page }) => { await page.route("**", (r) => r.fulfill({ body: "" })); });\n';
  for (const name of ['e2e/a"x.spec.ts', "e2e/b\\x.spec.ts", "e2e/café.spec.ts"]) {
    pr({ [name]: hidden });
    const r = await guard([]);
    assert.equal(r.code, 1, `${name}: ${r.out}`);
    assert.match(r.out, /skips, focuses or switches off a test/, name);
  }
});

test("guard: an adopted project's own invariants folder names who approves when e2e/ has no owner", async () => {
  pr({ "e2e/fixtures.ts": "export const isolated = false;\n" });
  labeler = "Owner";
  const other = await guard(["test-approved"], "pull_request", { INVARIANTS_DIR: "rules/inv" });
  assert.equal(other.code, 1);
  assert.match(other.out, /defines no owner for `e2e\/` or `rules\/inv\/`: nobody can approve/);
  assert.equal((await guard(["test-approved"])).code, 0, "the default folder is still tests/invariants/");
  labeler = "owner";
});

test("guard: the first setup (no e2e/ on the target branch yet) needs no label, but a new spec is still held to the rules", async () => {
  const root = mkdtempSync(join(tmpdir(), "guard-e2e-setup-"));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  const commit = (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    g("add", "-A");
    g("-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-qm", "c");
  };
  try {
    g("init", "-q", "-b", "main");
    commit({ "src/app.js": "export {};\n" });
    g("update-ref", "refs/remotes/origin/main", "HEAD");
    g("switch", "-q", "-c", "adopt");
    commit({
      "e2e/fixtures.ts": "export const isolated = true;\n",
      "e2e/playwright.config.ts": "export default {};\n",
      "e2e/package.json": "{}\n",
      "e2e/seed.spec.ts": SPEC,
    });
    const setup = await guard([], "pull_request", {}, root);
    assert.equal(setup.code, 0, setup.out);
    assert.match(setup.out, /First setup \(no `e2e\/` on `origin\/main` yet\), so no label is needed; review the isolation it adds: `e2e\/fixtures\.ts`/);

    commit({ "e2e/mocked.spec.ts": SPEC.replace('await page.goto("/");', 'await page.route("**", (r) => r.fulfill({ body: "" }));') });
    const mocked = await guard([], "pull_request", {}, root);
    assert.equal(mocked.code, 1);
    assert.match(mocked.out, /new `e2e\/mocked\.spec\.ts` uses `route`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const QUARANTINED = (annotation: string) =>
  SPEC.replace('test("CA-02: a valid coupon lowers the total", async', `test("CA-02: a valid coupon lowers the total", { tag: "@quarantine"${annotation} }, async`);

test("quarantined: finds tagged tests and the issue their annotation points to", () => {
  assert.deepEqual(quarantined(SPEC, "o/r"), []);
  assert.deepEqual(quarantined(QUARANTINED(""), "o/r"), [{ title: "CA-02: a valid coupon lowers the total", issue: null }]);
  const url = QUARANTINED(', annotation: { type: "issue", description: "https://github.com/o/r/issues/7" }');
  assert.deepEqual(quarantined(url, "o/r"), [{ title: "CA-02: a valid coupon lowers the total", issue: 7 }]);
  const list = QUARANTINED(', annotation: [{ type: "note", description: "x" }, { type: "issue", description: "#7" }]');
  assert.equal(quarantined(list, "o/r")[0]?.issue, 7);
  // Tags in a list, and the describe form, are found too.
  assert.equal(quarantined('test.describe("d", { tag: ["@slow", "@quarantine"] }, () => {});', "o/r").length, 1);
  assert.deepEqual(quarantined('test("checkout @quarantine", async () => {});', "o/r"), [{ title: "checkout @quarantine", issue: null }]);
  // An issue of another repository, or a lookalike URL, is no issue of this one.
  assert.equal(quarantined(url.replace("o/r/issues", "x/r/issues"), "o/r")[0]?.issue, null);
  assert.equal(quarantined(url.replace("/7", "/7/../../../x/r/issues/7"), "o/r")[0]?.issue, null);
  assert.equal(quarantined(url, "o.r")[0]?.issue, null, "the repository name is matched literally");
});

test("guard: quarantine needs the owner's label and an open issue; a closed issue asks for the tag to go", async () => {
  const withIssue = QUARANTINED(', annotation: { type: "issue", description: "https://github.com/o/r/issues/7" }');
  pr({ "e2e/coupon.spec.ts": withIssue });
  const without = await guard([]);
  assert.equal(without.code, 1, "adding the tag changes the test: test-approved");
  assert.match(without.out, /changes more than selectors/);
  labeler = "Owner";
  const open = await guard(["test-approved"]);
  assert.equal(open.code, 0, open.out);
  assert.match(open.out, /Quarantined: "CA-02: a valid coupon lowers the total" \(issue #7, open\)/);
  pr({ "e2e/coupon.spec.ts": QUARANTINED("") });
  const noIssue = await guard(["test-approved"]);
  assert.equal(noIssue.code, 1);
  assert.match(noIssue.out, /is in quarantine without an `issue` annotation pointing at an issue of o\/r/);
  pr({ "e2e/coupon.spec.ts": withIssue });
  issueState = "closed";
  const closed = await guard(["test-approved"]);
  assert.equal(closed.code, 1);
  assert.match(closed.out, /issue #7 is closed\. Remove the tag/);
  // On main a closed issue is only noted: the next PR asks for the tag to go.
  const onMain = await guard([], "push");
  assert.equal(onMain.code, 0, onMain.out);
  assert.match(onMain.out, /Quarantined: "CA-02: a valid coupon lowers the total" \(issue #7: closed\)/);
  // An issue that cannot be read, or a pull request, never counts as open.
  for (const [state, reason] of [["missing", /the API responded 404/], ["pull", /it is a pull request, not an issue/]] as const) {
    issueState = state;
    const r = await guard(["test-approved"]);
    assert.equal(r.code, 1, state);
    assert.match(r.out, /could not read issue #7/, state);
    assert.match(r.out, reason, state);
  }
  issueState = "open";
  labeler = "owner";
});
