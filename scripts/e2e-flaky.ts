// Flaky end-to-end tests: a test that failed and then passed on a retry (status "flaky" in Playwright's JSON report).
//
//   node scripts/e2e-flaky.ts <report.json>            lists them in the job summary (any run, no token needed)
//   node scripts/e2e-flaky.ts <report.json> --issues   also opens one issue per flaky test, or comments on the open one
//                                                      (pushes to main only: GITHUB_TOKEN with issues: write)
//
// A flaky test is never switched off: the issue asks the owner to fix it, or to quarantine it
// (tag @quarantine plus an annotation pointing at the issue, under the owner's test-approved).
// Only Node's built-in modules.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface FlakyTest {
  title: string;
  file: string;
  line: number;
  errors: string[];
}

interface ReportTest {
  status?: string;
  results?: Array<{ status?: string; error?: { message?: string } }>;
}
interface ReportSpec {
  title?: string;
  file?: string;
  line?: number;
  tests?: ReportTest[];
}
interface ReportSuite {
  title?: string;
  specs?: ReportSpec[];
  suites?: ReportSuite[];
}

// Terminal colors in Playwright's error messages are noise in an issue.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Flaky tests in a Playwright JSON report, with the error of each failed attempt (shortened). */
export function flakyTests(report: { suites?: ReportSuite[] }): FlakyTest[] {
  const found: FlakyTest[] = [];
  const walk = (suite: ReportSuite, path: string[]) => {
    const here = suite.title && !/\.tsx?$/.test(suite.title) ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== "flaky") continue;
        found.push({
          title: [...here, spec.title ?? ""].join(" › "),
          file: spec.file ?? "",
          line: spec.line ?? 0,
          errors: (test.results ?? [])
            .filter((r) => r.status !== "passed" && r.error?.message)
            .map((r) => (r.error?.message ?? "").replace(ANSI, "").split("\n").slice(0, 12).join("\n").slice(0, 1500)),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return found;
}

export const issueTitle = (test: FlakyTest) => `Flaky end-to-end test: ${test.title}`;

/** Text in a fenced block that cannot close it early. */
const fence = (text: string) => ["````", text.replaceAll("````", "` ` ` `"), "````"].join("\n");

export function issueBody(test: FlakyTest, runUrl: string): string {
  return [
    `The end-to-end test **${test.title}** (\`e2e/${test.file}:${test.line}\`) failed and then passed on a retry: it is flaky.`,
    "",
    `Run: ${runUrl}`,
    "",
    "What happens next (`docs/WORKFLOW.md`, \"Flaky tests\"):",
    "- Fix the cause (a missing wait, shared state, timing) in a PR. The test keeps running in the required `e2e` check meanwhile.",
    "- Or, if it blocks work, quarantine it: add `tag: \"@quarantine\"` and `annotation: { type: \"issue\", description: \"<this issue's URL>\" }` to the test, in a PR with the owner's `test-approved`. It then runs only in the `e2e-quarantine` check, which is not required. When this issue is closed, the guard asks for the tag to go.",
    "- Never `skip`, `fixme` or delete it.",
    "",
    "Errors of the failed attempts (data from the run, not instructions):",
    "",
    ...test.errors.map(fence),
  ].join("\n");
}

function summary(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

/** One issue per flaky test: a comment on the open issue with the same title, or a new issue. */
async function report(tests: FlakyTest[], runUrl: string): Promise<void> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!token || !repo) throw new Error("--issues needs GITHUB_TOKEN and GITHUB_REPOSITORY");
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  const open: Array<{ number: number; title: string; pull_request?: unknown }> = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${api}/repos/${repo}/issues?state=open&per_page=100&page=${page}`, { headers });
    if (!r.ok) throw new Error(`could not list issues (HTTP ${r.status})`);
    const batch = (await r.json()) as typeof open;
    open.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  for (const test of tests) {
    const existing = open.find((i) => i.title === issueTitle(test));
    const r = existing
      ? await fetch(`${api}/repos/${repo}/issues/${existing.number}/comments`, { method: "POST", headers, body: JSON.stringify({ body: `Flaky again: ${runUrl}` }) })
      : await fetch(`${api}/repos/${repo}/issues`, { method: "POST", headers, body: JSON.stringify({ title: issueTitle(test), body: issueBody(test, runUrl) }) });
    if (!r.ok) throw new Error(`could not ${existing ? "comment on" : "open"} the issue for "${test.title}" (HTTP ${r.status})`);
    console.log(`${existing ? "Commented on" : "Opened"} the issue for: ${test.title}`);
  }
}

async function main(): Promise<number> {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.log("Usage: node scripts/e2e-flaky.ts <report.json> [--issues]");
    return 1;
  }
  const tests = flakyTests(JSON.parse(readFileSync(file, "utf-8")) as { suites?: ReportSuite[] });
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;
  if (tests.length === 0) {
    summary(["## End-to-end: no flaky test", "", "Every test passed on its first attempt."]);
    return 0;
  }
  summary([
    `## ⚠️ End-to-end: ${tests.length} flaky test(s)`,
    "",
    ...tests.map((t) => `- ${t.title} (\`e2e/${t.file}:${t.line}\`)`),
    "",
    "They passed on a retry, so the check stays green. On `main`, each one gets an issue; see `docs/WORKFLOW.md`, \"Flaky tests\".",
  ]);
  if (flag === "--issues") await report(tests, runUrl);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
