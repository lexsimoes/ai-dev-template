// End-to-end guard, run by the "e2e" CI job before any code of the PR.
// The healer agent may update selectors; everything else a test does changes only by decision of the owner.
// Fails when:
//   1. any file in e2e/ skips, focuses or switches off a test (`.skip`, `.only`, `.fixme`, `.fail`, on any receiver),
//      with or without approval: a flaky test goes to quarantine, never off;
//   2. without the owner's "test-approved" label, the PR:
//      - changes an existing spec in anything but its selectors: comments and whitespace are ignored, and every locator
//        chain (`page.getByRole(...)`, `x.locator(...).filter(...)`, `.first()`, `.nth(...)` ...) counts as one selector;
//        an assertion, an expected value, a step, a return, a try/catch, an import or a route is not a selector;
//      - deletes or renames a spec, or adds or changes any other file in e2e/ (fixtures, helpers) or playwright.config.ts;
//      - adds a spec that imports from anywhere but ./fixtures.ts, or that routes, mocks or reconfigures the browser;
//   3. in CI, the label was applied by someone who is not an owner of e2e/ (or, without such a rule,
//      of tests/invariants/) in the CODEOWNERS of the target branch.
// A new spec that follows those rules needs no label.
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
const CONFIG = "playwright.config.ts";
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const SPEC_FILE = /\.spec\.[cm]?[jt]sx?$/;
const APPROVAL_LABEL = /^[\p{L}\p{N} ._:-]{1,50}$/u.test(process.env.E2E_APPROVAL_LABEL ?? "")
  ? (process.env.E2E_APPROVAL_LABEL as string)
  : "test-approved";
// On the normalized source (no comments, no whitespace): any receiver, dot or bracket access.
const DISABLE = /\.(?:skip|only|fixme|fail)\(|\[(["'`])(?:skip|only|fixme|fail)\1\]/;
const LOCATOR_METHODS = "getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle|getByTestId|locator|filter|and|or|nth|first|last|frameLocator|contentFrame";
// Things a new spec may not do without approval: leave the isolation, fake the app, or reconfigure the run.
const NEW_SPEC_FORBIDDEN = /\.(?:route|unroute|unrouteAll|routeFromHAR|fulfill|setContent|addInitScript|exposeFunction|exposeBinding|use|configure)\(|\b(?:beforeEach|beforeAll|afterEach|afterAll)\(/;

function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8" });
}

/**
 * The source with comments and whitespace removed and strings kept as they are: two versions that differ only
 * in comments or formatting normalize to the same text. Whitespace stays (as one space) only between two word characters.
 */
export function normalize(source: string): string {
  let out = "";
  let pendingSpace = false;
  const word = (c: string | undefined) => c !== undefined && /[\w$]/.test(c);
  for (let i = 0; i < source.length; i++) {
    const c = source.charAt(i);
    if (/\s/.test(c)) {
      pendingSpace = true;
      continue;
    }
    if (c === "/" && source.charAt(i + 1) === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i++;
      pendingSpace = true;
      continue;
    }
    if (c === "/" && source.charAt(i + 1) === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 1;
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && word(out.at(-1)) && word(c)) out += " ";
    pendingSpace = false;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      for (; j < source.length && source.charAt(j) !== c; j++) if (source.charAt(j) === "\\") j++;
      out += source.slice(i, j + 1);
      i = j;
    } else {
      out += c;
    }
  }
  // A trailing comma is formatting, not behavior.
  return out.replace(/,([)\]}])/g, "$1");
}

/** Index just after the bracket that closes the one at `open`, on normalized text (strings are skipped). */
export function closingIndex(text: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === "\\") {
      i++;
    } else if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text.charAt(i) !== c; i++) if (text.charAt(i) === "\\") i++;
    } else if (pairs[c]) {
      stack.push(pairs[c] as string);
    } else if (c === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** The normalized source with every locator chain replaced by one token: what is left is what the test does. */
export function skeleton(source: string): string {
  let text = normalize(source);
  const call = new RegExp(`\\.(?:${LOCATOR_METHODS})\\(`, "g");
  let out = "";
  let last = 0;
  for (let m = call.exec(text); m; m = call.exec(text)) {
    const end = closingIndex(text, m.index + m[0].length - 1);
    if (end < 0) break;
    out += `${text.slice(last, m.index)}.L()`;
    last = end;
    call.lastIndex = end;
  }
  text = out + text.slice(last);
  // A receiver followed by locator calls is one selector, whatever the receiver and however many calls.
  return text.replace(/[A-Za-z_$][\w$]*(?:\.L\(\))+/g, "LOC");
}

/** Where two skeletons first differ, as a short excerpt of each, for the report. */
export function firstDifference(before: string, after: string): string {
  let i = 0;
  while (i < before.length && i < after.length && before.charAt(i) === after.charAt(i)) i++;
  const cut = (s: string) => s.slice(Math.max(0, i - 30), i + 50);
  return `\`…${cut(before)}…\` became \`…${cut(after)}…\``;
}

/** Problems of a new spec that keep it from coming in without approval. */
export function newSpecProblems(source: string): string[] {
  const text = normalize(source);
  const problems: string[] = [];
  for (const m of text.matchAll(/(?:^|[;}])import(?:[^;]*?from)?(["'`])([^"'`]*)\1/g)) {
    if (!/^\.\/fixtures(?:\.ts)?$/.test(m[2] ?? "")) problems.push(`imports \`${m[2]}\` (only ./fixtures.ts, which holds the isolation)`);
  }
  if (NEW_SPEC_FORBIDDEN.test(text)) problems.push("routes, mocks or reconfigures the browser or the run");
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

function codeFiles(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { recursive: true, encoding: "utf-8" })
    .map((name) => join(DIR, name).replaceAll("\\", "/"))
    .filter((file) => CODE_FILE.test(file));
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const notes: string[] = [];

  // 1. Nothing skipped, focused or switched off, with or without approval.
  const files = codeFiles();
  for (const file of files) {
    if (DISABLE.test(normalize(readFileSync(file, "utf-8")))) errors.push(`\`${file}\` skips, focuses or switches off a test (\`.skip\`, \`.only\`, \`.fixme\` or \`.fail\`).`);
  }

  // 2 and 3. Only in PRs and local use: compares with the target branch.
  if (process.env.EVENT_NAME !== "push") {
    const baseRef = `origin/${process.env.BASE_REF || "main"}`;
    const changes: string[] = [];
    const baseFiles = git("ls-tree", "-r", "--name-only", baseRef, "--", DIR).split("\n").filter((f) => CODE_FILE.test(f));
    for (const file of baseFiles) {
      if (!existsSync(file)) {
        changes.push(`\`${file}\` deleted or renamed`);
        continue;
      }
      const before = git("show", `${baseRef}:${file}`);
      const after = readFileSync(file, "utf-8");
      if (SPEC_FILE.test(file)) {
        const [a, b] = [skeleton(before), skeleton(after)];
        if (a !== b) changes.push(`\`${file}\` changes more than selectors: ${firstDifference(a, b)}`);
      } else if (normalize(before) !== normalize(after)) {
        changes.push(`\`${file}\` changed (isolation or shared test code)`);
      }
    }
    for (const file of files.filter((f) => !baseFiles.includes(f))) {
      if (!SPEC_FILE.test(file)) changes.push(`\`${file}\` added (shared test code is approved like the isolation)`);
      else for (const p of newSpecProblems(readFileSync(file, "utf-8"))) changes.push(`new \`${file}\` ${p}`);
    }
    if (git("diff", "--name-only", `${baseRef}...HEAD`, "--", CONFIG).trim()) changes.push(`\`${CONFIG}\` changed (run setup)`);
    notes.push(`Files in \`${DIR}/\` on \`${baseRef}\`: ${baseFiles.length}; changed beyond selectors without approval: ${changes.length}.`);

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
