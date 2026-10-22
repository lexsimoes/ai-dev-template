// End-to-end guard, run by the "e2e" CI job before any code of the PR.
// The healer agent may update selectors; what a test checks only changes by decision of the owner.
// Fails when:
//   1. a test in e2e/ is skipped, focused or marked fixme/fail (always: a flaky test goes to quarantine, never off);
//   2. without the owner's "test-approved" label, the PR:
//      - changes or removes an assertion: the matcher of an `expect(...)` and its expected values
//        (the subject, usually a locator, may change: that is a selector);
//      - removes or renames a test, or deletes a spec file;
//      - changes the isolation or the run setup (e2e/fixtures.ts, playwright.config.ts);
//   3. in CI, the label was applied by someone who is not an owner of e2e/ (or, without such a rule,
//      of tests/invariants/) in the CODEOWNERS of the target branch.
// Adding tests or assertions needs no label.
//
// CI runs the version of this file that is on the target branch: a PR cannot loosen its own guard.
// Only Node's built-in modules: it runs before npm ci.
//
// Environment variables (set by the workflow):
//   EVENT_NAME, BASE_REF, PR_LABELS, PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN  as in scripts/guard-invariants.ts
//   E2E_APPROVAL_LABEL  name of the approval label (default "test-approved")
//
// Local use: node scripts/guard-e2e.ts  (after git fetch origin main)

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "e2e";
const SETUP_FILES = ["e2e/fixtures.ts", "playwright.config.ts"];
const APPROVAL_LABEL = /^[\p{L}\p{N} ._:-]{1,50}$/u.test(process.env.E2E_APPROVAL_LABEL ?? "")
  ? (process.env.E2E_APPROVAL_LABEL as string)
  : "test-approved";
const DISABLE_PATTERN = /\b(?:test|describe|it)(?:\s*\.\s*describe)?\s*\.\s*(?:skip|only|fixme|fail)\b|\binfo\(\)\s*\.\s*(?:skip|fixme|fail)\b/;

function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8" });
}

/** Index just after the bracket that closes the one at `open`; skips strings, template literals, comments and escapes. */
export function closingIndex(source: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let i = open; i < source.length; i++) {
    const c = source.charAt(i);
    if (c === "\\") {
      i++;
    } else if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source.charAt(i) !== c; i++) if (source.charAt(i) === "\\") i++;
    } else if (c === "/" && source.charAt(i + 1) === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i++;
    } else if (c === "/" && source.charAt(i + 1) === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 1;
    } else if (pairs[c]) {
      stack.push(pairs[c] as string);
    } else if (c === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * What each assertion checks: `expect`, its modifiers and matcher, and the expected values, without the subject.
 * `expect(page.getByTestId("total")).toHaveText("$45.00")` → `expect().toHaveText("$45.00")`.
 */
export function assertions(source: string): string[] {
  const found: string[] = [];
  const start = /\bexpect(\s*\.\s*(?:soft|poll))?\s*\(/g;
  for (let m = start.exec(source); m; m = start.exec(source)) {
    const subjectEnd = closingIndex(source, m.index + m[0].length - 1);
    if (subjectEnd < 0) break;
    let chain = "";
    let i = subjectEnd;
    for (;;) {
      const link = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*/.exec(source.slice(i));
      if (!link) break;
      chain += `.${link[1]}`;
      i += link[0].length;
      if (source.charAt(i) === "(") {
        const end = closingIndex(source, i);
        if (end < 0) break;
        chain += `(${squash(source.slice(i + 1, end - 1))})`;
        i = end;
      }
    }
    found.push(`expect${squash(m[1] ?? "").replace(/\s/g, "")}()${chain}`);
    start.lastIndex = subjectEnd;
  }
  return found;
}

/** Titles of the tests (not of the describe blocks or steps). */
export function testTitles(source: string): string[] {
  const titles: string[] = [];
  const re = /\btest\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  for (let m = re.exec(source); m; m = re.exec(source)) titles.push(m[2] ?? "");
  return titles;
}

/** What `before` checks and `after` no longer does: missing assertions (counted) and missing test titles. */
export function weakened(before: string, after: string): string[] {
  const problems: string[] = [];
  const left = new Map<string, number>();
  for (const a of assertions(after)) left.set(a, (left.get(a) ?? 0) + 1);
  for (const a of assertions(before)) {
    const n = left.get(a) ?? 0;
    if (n > 0) left.set(a, n - 1);
    else problems.push(`assertion changed or removed: \`${a}\``);
  }
  const titles = new Set(testTitles(after));
  for (const t of testTitles(before)) if (!titles.has(t)) problems.push(`test removed or renamed: "${t}"`);
  return problems;
}

export interface IssueEvent {
  event: string;
  label?: { name: string };
  actor?: { login: string } | null;
  created_at: string;
}

// Same rules as scripts/guard-invariants.ts (kept separate: each guard runs alone, from the target branch).
export function ownersOf(codeowners: string, path: string): string[] {
  const target = path.replace(/^\//, "");
  let owners: string[] = [];
  for (const raw of codeowners.split("\n")) {
    const [pattern = "", ...rest] = raw.replace(/#.*/, "").trim().split(/\s+/);
    if (!pattern) continue;
    const prefix = pattern.replace(/^\//, "");
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (pattern === "*" || target === prefix || target.startsWith(dir)) {
      owners = rest.filter((o) => o.startsWith("@") && !o.includes("/")).map((o) => o.slice(1).toLowerCase());
    }
  }
  return owners;
}

export function lastLabeler(events: IssueEvent[], label: string): string | null {
  const applied = events.filter((e) => e.event === "labeled" && e.label?.name === label);
  if (applied.length === 0) return null;
  return applied.at(-1)?.actor?.login ?? "unknown";
}

export function isLabeled(events: IssueEvent[], label: string): boolean {
  const last = events.filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === label).at(-1);
  return last?.event === "labeled";
}

async function issueEvents(): Promise<{ events: IssueEvent[] | null; reason: string }> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) return { events: null, reason: "no access to the GitHub API in this environment" };
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const events: IssueEvent[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${api}/repos/${repo}/issues/${pr}/events?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { events: null, reason: `the API responded ${response.status}` };
    const batch = (await response.json()) as IssueEvent[];
    events.push(...batch);
    if (batch.length < 100) return { events, reason: "" };
  }
  return { events: null, reason: "the PR has more than 1,000 events and the history was not read in full" };
}

function report(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

function specFiles(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { recursive: true, encoding: "utf-8" })
    .filter((name) => /\.[cm]?[jt]s$/.test(name))
    .map((name) => join(DIR, name).replaceAll("\\", "/"));
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const notes: string[] = [];

  // 1. Nothing skipped, focused or switched off, with or without approval.
  for (const file of specFiles()) {
    readFileSync(file, "utf-8")
      .split("\n")
      .forEach((line, i) => {
        if (DISABLE_PATTERN.test(line)) errors.push(`\`${file}:${i + 1}\` skips, focuses or switches off a test: \`${line.trim()}\``);
      });
  }

  // 2 and 3. Only in PRs and local use: compares with the target branch.
  if (process.env.EVENT_NAME !== "push") {
    const baseRef = `origin/${process.env.BASE_REF || "main"}`;
    const changes: string[] = [];
    const baseSpecs = git("ls-tree", "-r", "--name-only", baseRef, "--", DIR)
      .split("\n")
      .filter((f) => /\.spec\.[cm]?[jt]s$/.test(f));
    for (const file of baseSpecs) {
      if (!existsSync(file)) {
        changes.push(`\`${file}\` deleted`);
        continue;
      }
      for (const p of weakened(git("show", `${baseRef}:${file}`), readFileSync(file, "utf-8"))) changes.push(`\`${file}\`: ${p}`);
    }
    const setupChanged = git("diff", "--name-only", `${baseRef}...HEAD`, "--", ...SETUP_FILES).split("\n").filter(Boolean);
    for (const file of setupChanged) changes.push(`\`${file}\` changed (isolation or run setup)`);
    notes.push(`Spec files on \`${baseRef}\`: ${baseSpecs.length}; assertions kept or added, tests kept: ${changes.length === 0 ? "yes" : "no"}.`);

    if (changes.length > 0) {
      const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[] | null;
      let approved = (labels ?? []).includes(APPROVAL_LABEL);
      if (approved) {
        const { events, reason } = await issueEvents();
        if (!events) {
          if (process.env.EVENT_NAME === "pull_request") {
            approved = false;
            errors.push(`Could not check who applied the \`${APPROVAL_LABEL}\` label (${reason}). Run the job again.`);
          } else {
            notes.push(`Who applied the label: not verified (${reason}).`);
          }
        } else if (!isLabeled(events, APPROVAL_LABEL)) {
          approved = false;
          errors.push(`The \`${APPROVAL_LABEL}\` label is not applied right now (it was removed after this event).`);
        } else {
          const codeowners = git("ls-tree", "--name-only", baseRef, ".github/CODEOWNERS").trim() ? git("show", `${baseRef}:.github/CODEOWNERS`) : "";
          const own = ownersOf(codeowners, `${DIR}/`);
          const owners = own.length > 0 ? own : ownersOf(codeowners, "tests/invariants/");
          const labeler = lastLabeler(events, APPROVAL_LABEL);
          if (owners.length === 0) {
            approved = false;
            errors.push(`The CODEOWNERS of \`${baseRef}\` defines no owner for \`${DIR}/\` or \`tests/invariants/\`: nobody can approve.`);
          } else if (!labeler || !owners.includes(labeler.toLowerCase())) {
            approved = false;
            errors.push(`The \`${APPROVAL_LABEL}\` label was applied by @${labeler ?? "unknown"}, who is not an owner (${owners.map((o) => `@${o}`).join(", ")}).`);
          } else {
            notes.push(`Label \`${APPROVAL_LABEL}\` applied by @${labeler}.`);
          }
        }
      }
      if (approved) notes.push(...changes.map((c) => `Approved: ${c}.`));
      else errors.push(...changes.map((c) => `${c}, without a valid \`${APPROVAL_LABEL}\` label.`));
    }
  }

  if (errors.length > 0) {
    report([
      "## ❌ End-to-end guard",
      "",
      ...errors.map((e) => `- ${e}`),
      "",
      ...notes.map((n) => `- ${n}`),
      "",
      "A selector may change freely; what a test checks changes only by decision of the owner.",
      `Agent: stop and ask. Owner: if the change is intentional, apply the \`${APPROVAL_LABEL}\` label to the PR yourself.`,
    ]);
    return 1;
  }
  report(["## ✅ End-to-end guard", "", ...notes.map((n) => `- ${n}`), "- No test skipped, focused or switched off."]);
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
