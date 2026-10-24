// End-to-end guard, run by the "e2e" CI job before any code of the PR.
// The healer agent may update selectors; everything else a test does changes only by decision of the owner.
// Fails when:
//   1. any file in e2e/ skips, focuses or switches off a test (`.skip`, `.only`, `.fixme`, `.fail`, on any receiver),
//      with or without approval: a flaky test goes to quarantine, never off;
//   2. without the owner's "test-approved" label, the PR:
//      - changes an existing spec in anything but its selectors: comments and whitespace are ignored, and every locator
//        chain (`page.getByRole(...)`, `x.locator(...).filter(...)`, `.first()`, `.nth(...)` ...) counts as one selector;
//        an assertion, an expected value, a step, a return, a try/catch, an import or a route is not a selector;
//      - deletes or renames a spec, or adds or changes any other file in e2e/ (fixtures, helpers, a config or the
//        tester's own package.json and lockfile in an adopted project) or playwright.config.ts;
//      - adds a spec that imports from anywhere but ./fixtures.ts, or that routes, mocks or reconfigures the browser;
//   3. in CI, the label was applied by someone who is not an owner of e2e/ (or, without such a rule,
//      of the invariants folder) in the CODEOWNERS of the target branch;
//   4. a test in quarantine (tag "@quarantine") has no `annotation: { type: "issue", description: <issue URL> }` pointing
//      at an issue of this repository, or, in a PR, that issue is closed (fixed: the tag goes) or cannot be read.
// A new spec that follows those rules needs no label. Neither does the first setup: when the target branch has no e2e/
// and no playwright.config.ts yet, there is nothing to weaken, so the files a PR adds there are listed, not blocked
// (a new spec is still held to the rules above).
//
// CI runs the version of this file that is on the target branch: a PR cannot loosen its own guard.
// It runs before npm ci, with Node's built-in modules and the TypeScript parser (the specs are read as syntax trees,
// never as text): CI installs the TypeScript version pinned by the target branch's lockfile in a folder of its own.
//
// Environment variables (set by the workflow):
//   EVENT_NAME, BASE_REF, PR_LABELS, PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN  as in scripts/guard-invariants.ts
//   E2E_APPROVAL_LABEL  name of the approval label (default "test-approved")
//   E2E_GUARD_MODULES   folder whose node_modules holds `typescript` (default: the current folder)
//   INVARIANTS_DIR      folder of the non-negotiable tests, whose owner approves when e2e/ has none (default "tests/invariants")
//
// Local use: node scripts/guard-e2e.ts  (after git fetch origin main)

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "e2e";
const CONFIG = "playwright.config.ts";
const INVARIANTS_DIR = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]{1,100}$/.test(process.env.INVARIANTS_DIR ?? "")
  ? (process.env.INVARIANTS_DIR as string).replace(/\/+$/, "")
  : "tests/invariants";
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const SPEC_FILE = /\.spec\.[cm]?[jt]sx?$/;
const APPROVAL_LABEL = /^[\p{L}\p{N} ._:-]{1,50}$/u.test(process.env.E2E_APPROVAL_LABEL ?? "")
  ? (process.env.E2E_APPROVAL_LABEL as string)
  : "test-approved";
const LOCATOR_METHODS = new Set([
  "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId",
  "locator", "filter", "and", "or", "nth", "first", "last", "frameLocator", "contentFrame",
]);
// Names that switch a test off, wherever they appear (property, variable, destructuring, string key).
const DISABLE_NAMES = new Set(["skip", "only", "fixme", "fail"]);
// Names that give dynamic access, which could build one of those at run time (as a name or a string key).
const DYNAMIC_NAMES = new Set(["eval", "Function", "Reflect", "globalThis", "constructor", "require"]);
// What a new spec may not do without approval: leave the isolation, fake the app, reconfigure the run, share setup.
const NEW_SPEC_NAMES = new Set([
  "route", "unroute", "unrouteAll", "routeFromHAR", "fulfill", "setContent", "addInitScript", "exposeFunction", "exposeBinding",
  "use", "configure", "beforeEach", "beforeAll", "afterEach", "afterAll",
]);

type TS = typeof import("typescript");
type Node = import("typescript").Node;
let tsModule: TS | null = null;

/** The TypeScript parser, from E2E_GUARD_MODULES in CI (installed before any PR code), else the current folder. */
function ts(): TS {
  tsModule ??= createRequire(join(process.env.E2E_GUARD_MODULES || process.cwd(), "guard.cjs"))("typescript") as TS;
  return tsModule;
}

function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8" });
}

/** The syntax tree of a file; null when it does not parse (a file that does not parse is never taken as unchanged). */
export function parse(source: string, file = "spec.ts"): import("typescript").SourceFile | null {
  const t = ts();
  const kind = file.endsWith("x") ? (file.includes(".ts") ? t.ScriptKind.TSX : t.ScriptKind.JSX) : /\.[cm]?js$/.test(file) ? t.ScriptKind.JS : t.ScriptKind.TS;
  const diagnostics = t.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: t.JsxEmit.Preserve } }).diagnostics ?? [];
  if (diagnostics.length > 0) return null;
  return t.createSourceFile(file, source, t.ScriptTarget.Latest, true, kind);
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  ts().forEachChild(node, (child) => walk(child, visit));
}

/** Plain data: literals, names, and object or array literals made of them. No call, function, await or operator. */
function plainData(node: Node): boolean {
  const t = ts();
  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isRegularExpressionLiteral(node) || t.isNoSubstitutionTemplateLiteral(node) || t.isIdentifier(node)) return true;
  if (node.kind === t.SyntaxKind.TrueKeyword || node.kind === t.SyntaxKind.FalseKeyword || node.kind === t.SyntaxKind.NullKeyword) return true;
  if (t.isPrefixUnaryExpression(node)) return node.operator === t.SyntaxKind.MinusToken && t.isNumericLiteral(node.operand);
  if (t.isArrayLiteralExpression(node)) return node.elements.every(plainData);
  if (t.isObjectLiteralExpression(node)) {
    return node.properties.every((p) => (t.isPropertyAssignment(p) && (t.isIdentifier(p.name) || t.isStringLiteral(p.name)) && plainData(p.initializer)) || t.isShorthandPropertyAssignment(p));
  }
  return false;
}

/** `x.getByRole(...)`, `x.locator(...).filter(...).first()`: a name followed by locator calls with plain-data arguments. */
function isLocatorChain(node: Node): boolean {
  const t = ts();
  if (!t.isCallExpression(node) || !t.isPropertyAccessExpression(node.expression) || node.expression.questionDotToken) return false;
  if (!t.isIdentifier(node.expression.name) || !LOCATOR_METHODS.has(node.expression.name.text) || !node.arguments.every(plainData)) return false;
  const receiver = node.expression.expression;
  return t.isIdentifier(receiver) || isLocatorChain(receiver);
}

/** The tree written out with every locator chain as LOC: comments and formatting are gone, what is left is what the test does. */
export function skeleton(source: string, file = "spec.ts"): string {
  const t = ts();
  const sf = parse(source, file);
  if (!sf) return `does not parse: ${source}`;
  const write = (node: Node): string => {
    if (isLocatorChain(node)) return "LOC";
    let head = t.SyntaxKind[node.kind] ?? String(node.kind);
    if (t.isIdentifier(node) || t.isPrivateIdentifier(node)) head += `:${node.text}`;
    else if (t.isLiteralExpression(node) || t.isTemplateHead(node) || t.isTemplateMiddle(node) || t.isTemplateTail(node)) head += `:${JSON.stringify(node.text)}`;
    else if (t.isPrefixUnaryExpression(node) || t.isPostfixUnaryExpression(node)) head += `:${t.SyntaxKind[node.operator]}`;
    const children: string[] = [];
    t.forEachChild(node, (child) => {
      children.push(write(child));
    });
    return children.length > 0 ? `${head}(${children.join(",")})` : head;
  };
  return write(sf);
}

/** Where two skeletons first differ, as a short excerpt of each, for the report. */
export function firstDifference(before: string, after: string): string {
  let i = 0;
  while (i < before.length && i < after.length && before.charAt(i) === after.charAt(i)) i++;
  const cut = (s: string) => s.slice(Math.max(0, i - 40), i + 60);
  return `\`…${cut(before)}…\` became \`…${cut(after)}…\``;
}

/** Name of an identifier, private name or string-like literal; null for anything else. */
function nameOf(node: Node): string | null {
  const t = ts();
  if (t.isIdentifier(node) || t.isPrivateIdentifier(node)) return node.text;
  if (t.isStringLiteral(node) || t.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Ways the source switches a test off, or could hide doing so. A file that does not parse is a problem too. */
export function disableProblems(source: string, file = "spec.ts"): string[] {
  const t = ts();
  const sf = parse(source, file);
  if (!sf) return ["does not parse"];
  const problems = new Set<string>();
  walk(sf, (node) => {
    const name = nameOf(node);
    if (name !== null && DISABLE_NAMES.has(name)) problems.add(`uses \`${name}\``);
    if (name !== null && DYNAMIC_NAMES.has(name)) problems.add(`uses \`${name}\` (dynamic access could hide a skip)`);
    if (t.isElementAccessExpression(node) && !(t.isStringLiteral(node.argumentExpression) || t.isNumericLiteral(node.argumentExpression))) {
      problems.add("uses a computed member access (`x[...]`) with something other than one plain key");
    }
    if (t.isComputedPropertyName(node)) problems.add("uses a computed property name (`{ [x]: ... }`)");
    if (t.isCallExpression(node) && node.expression.kind === t.SyntaxKind.ImportKeyword) problems.add("loads a module at run time");
  });
  return [...problems];
}

/** Problems of a new spec that keep it from coming in without approval. */
export function newSpecProblems(source: string, file = "spec.ts"): string[] {
  const t = ts();
  const sf = parse(source, file);
  if (!sf) return ["does not parse"];
  const problems = new Set<string>();
  walk(sf, (node) => {
    if ((t.isImportDeclaration(node) || t.isExportDeclaration(node)) && node.moduleSpecifier && t.isStringLiteral(node.moduleSpecifier)) {
      if (!/^\.\/fixtures(?:\.ts)?$/.test(node.moduleSpecifier.text)) problems.add(`imports "${node.moduleSpecifier.text}" (only ./fixtures.ts, which holds the isolation)`);
    }
    const dynamicImport = t.isCallExpression(node) && node.expression.kind === t.SyntaxKind.ImportKeyword;
    if (t.isImportEqualsDeclaration(node) || dynamicImport || (t.isIdentifier(node) && node.text === "require")) problems.add("loads a module at run time");
    const name = nameOf(node);
    if (name !== null && NEW_SPEC_NAMES.has(name)) problems.add(`uses \`${name}\` (routes, mocks, reconfigures or shares setup)`);
  });
  return [...problems];
}

export interface Quarantined {
  title: string;
  /** Issue number from the annotation, or null when there is none (or it points elsewhere). */
  issue: number | null;
}

/** Tests tagged @quarantine, with the issue their `issue` annotation points to. */
export function quarantined(source: string, repo: string, file = "spec.ts"): Quarantined[] {
  const t = ts();
  const sf = parse(source, file);
  if (!sf) return [];
  const found: Quarantined[] = [];
  const strings = (node: import("typescript").Expression | undefined): string[] =>
    !node ? [] : t.isStringLiteral(node) || t.isNoSubstitutionTemplateLiteral(node) ? [node.text] : t.isArrayLiteralExpression(node) ? node.elements.flatMap((e) => strings(e)) : [];
  const property = (obj: import("typescript").ObjectLiteralExpression, name: string) =>
    obj.properties.find((p): p is import("typescript").PropertyAssignment => t.isPropertyAssignment(p) && nameOf(p.name) === name)?.initializer;
  const issueUrl = new RegExp(`^(?:https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/issues/|#)(\\d+)$`);
  walk(sf, (node) => {
    if (!t.isCallExpression(node)) return;
    const title = strings(node.arguments[0])[0];
    const details = node.arguments.find((a): a is import("typescript").ObjectLiteralExpression => t.isObjectLiteralExpression(a));
    // Playwright also reads a tag written in the title ("checkout @quarantine").
    if (!strings(details && property(details, "tag")).includes("@quarantine") && !title?.includes("@quarantine")) return;
    const annotation = details && property(details, "annotation");
    const annotations = !annotation ? [] : t.isArrayLiteralExpression(annotation) ? annotation.elements : [annotation];
    let issue: number | null = null;
    for (const a of annotations) {
      if (!t.isObjectLiteralExpression(a) || strings(property(a, "type"))[0] !== "issue") continue;
      const m = issueUrl.exec(strings(property(a, "description"))[0] ?? "");
      if (m) issue = Number(m[1]);
    }
    found.push({ title: title ?? "(untitled)", issue });
  });
  return found;
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

/** "open", "closed", or why the state could not be read. */
async function issueState(issue: number): Promise<string> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!token || !repo) return "not verified: no access to the GitHub API";
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const r = await fetch(`${api}/repos/${repo}/issues/${issue}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) return `the API responded ${r.status}`;
  const body = (await r.json()) as { state?: string; pull_request?: unknown };
  if (body.pull_request) return "it is a pull request, not an issue";
  return body.state === "open" || body.state === "closed" ? body.state : "unknown state";
}

function report(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

/**
 * Every file in e2e/ that git sees, tracked or new, so an installed node_modules/ (ignored) is not read. `-z` keeps
 * each name as it is: without it, git quotes a name with a quote, a backslash or a non-ASCII letter, and that file
 * would be missed.
 */
function e2eFiles(): string[] {
  if (!existsSync(DIR)) return [];
  return git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", DIR)
    .split("\0")
    .filter((file) => file && existsSync(file));
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const notes: string[] = [];

  // 1. Nothing skipped, focused or switched off, with or without approval.
  const all = e2eFiles();
  const files = all.filter((file) => CODE_FILE.test(file));
  for (const file of files) {
    for (const p of disableProblems(readFileSync(file, "utf-8"), file)) errors.push(`\`${file}\` skips, focuses or switches off a test, or could hide it: ${p}.`);
  }

  // 4. Every quarantined test points to an open issue of this repository.
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  for (const file of files.filter((f) => SPEC_FILE.test(f))) {
    for (const q of quarantined(readFileSync(file, "utf-8"), repo, file)) {
      if (q.issue === null) {
        errors.push(`\`${file}\`: "${q.title}" is in quarantine without an \`issue\` annotation pointing at an issue of ${repo || "this repository"}.`);
        continue;
      }
      const state = await issueState(q.issue);
      if (state === "open") notes.push(`Quarantined: "${q.title}" (issue #${q.issue}, open).`);
      else if (process.env.EVENT_NAME !== "pull_request") notes.push(`Quarantined: "${q.title}" (issue #${q.issue}: ${state}).`);
      else if (state === "closed") errors.push(`\`${file}\`: "${q.title}" is still in quarantine, but issue #${q.issue} is closed. Remove the tag (the test is fixed) or reopen the issue.`);
      else errors.push(`\`${file}\`: could not read issue #${q.issue} for "${q.title}" (${state}). Run the job again.`);
    }
  }

  // 2 and 3. Only in PRs and local use: compares with the target branch.
  if (process.env.EVENT_NAME !== "push") {
    const baseRef = `origin/${process.env.BASE_REF || "main"}`;
    const changes: string[] = [];
    const baseFiles = git("ls-tree", "-r", "-z", "--name-only", baseRef, "--", DIR).split("\0").filter(Boolean);
    const firstSetup = baseFiles.length === 0 && !git("ls-tree", "--name-only", baseRef, "--", CONFIG).trim();
    const setup: string[] = [];
    for (const file of baseFiles) {
      if (!existsSync(file)) {
        changes.push(`\`${file}\` deleted or renamed`);
        continue;
      }
      const before = git("show", `${baseRef}:${file}`);
      const after = readFileSync(file, "utf-8");
      if (SPEC_FILE.test(file)) {
        const [a, b] = [skeleton(before, file), skeleton(after, file)];
        if (a !== b) changes.push(`\`${file}\` changes more than selectors: ${firstDifference(a, b)}`);
      } else if (before !== after) {
        changes.push(`\`${file}\` changed (isolation, shared test code or the tester's dependencies)`);
      }
    }
    for (const file of all.filter((f) => !baseFiles.includes(f))) {
      if (SPEC_FILE.test(file)) for (const p of newSpecProblems(readFileSync(file, "utf-8"), file)) changes.push(`new \`${file}\` ${p}`);
      else if (firstSetup) setup.push(`\`${file}\``);
      else changes.push(`\`${file}\` added (shared test code is approved like the isolation)`);
    }
    if (setup.length > 0) notes.push(`First setup (no \`${DIR}/\` on \`${baseRef}\` yet), so no label is needed; review the isolation it adds: ${setup.join(", ")}.`);
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
          const owners = own.length > 0 ? own : ownersOf(codeowners, `${INVARIANTS_DIR}/`);
          const labeler = lastLabeler(events, APPROVAL_LABEL);
          if (owners.length === 0) {
            approved = false;
            errors.push(`The CODEOWNERS of \`${baseRef}\` defines no owner for \`${DIR}/\` or \`${INVARIANTS_DIR}/\`: nobody can approve.`);
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
