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
const LOCATOR_METHODS = new Set([
  "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId",
  "locator", "filter", "and", "or", "nth", "first", "last", "frameLocator", "contentFrame",
]);
// Words that switch a test off (as a property, a variable or a computed key), and dynamic access that could hide one.
const DISABLE_WORDS = new Set(["skip", "only", "fixme", "fail"]);
const DYNAMIC_WORDS = new Set(["eval", "Function", "Reflect", "globalThis", "constructor", "require"]);
// What a new spec may not do without approval: leave the isolation, fake the app, or reconfigure the run.
const NEW_SPEC_METHODS = new Set(["route", "unroute", "unrouteAll", "routeFromHAR", "fulfill", "setContent", "addInitScript", "exposeFunction", "exposeBinding", "use", "configure"]);
const HOOKS = new Set(["beforeEach", "beforeAll", "afterEach", "afterAll"]);
// A locator argument is masked only when it is plain data: these make it code.
const CODE_IN_ARGS = new Set(["await", "function", "yield", "new", "import", "return", "async"]);
const REGEX_AFTER_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "await", "yield"]);

export interface Token {
  type: "word" | "str" | "regex" | "punct";
  text: string;
}

function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8" });
}

/**
 * Splits JavaScript/TypeScript source into words, strings, regex literals and punctuation, without comments or whitespace.
 * Template literals keep their text parts as strings and their `${...}` expressions as tokens, so code there is seen too.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const isWord = (c: string) => /[\w$]/.test(c);
  const regexCanStart = () => {
    const last = tokens.at(-1);
    if (!last) return true;
    if (last.type === "word") return REGEX_AFTER_WORDS.has(last.text);
    return last.type === "punct" && !/^[)\]}]$/.test(last.text);
  };
  let i = 0;
  const readQuoted = (quote: string) => {
    const start = i;
    for (i++; i < source.length && source.charAt(i) !== quote; i++) if (source.charAt(i) === "\\") i++;
    i++;
    tokens.push({ type: "str", text: source.slice(start, i) });
  };
  const readTemplate = () => {
    let part = "`";
    for (i++; i < source.length; i++) {
      const c = source.charAt(i);
      if (c === "\\") {
        part += c + source.charAt(i + 1);
        i++;
      } else if (c === "`") {
        tokens.push({ type: "str", text: `${part}\`` });
        i++;
        return;
      } else if (c === "$" && source.charAt(i + 1) === "{") {
        tokens.push({ type: "str", text: `${part}\`` });
        tokens.push({ type: "punct", text: "${" });
        let depth = 1;
        const start = i + 2;
        let j = start;
        for (; j < source.length && depth > 0; j++) {
          const d = source.charAt(j);
          if (d === "{") depth++;
          else if (d === "}") depth--;
        }
        tokens.push(...tokenize(source.slice(start, j - 1)));
        tokens.push({ type: "punct", text: "}" });
        part = "`";
        i = j - 1;
      } else {
        part += c;
      }
    }
    tokens.push({ type: "str", text: part });
  };
  while (i < source.length) {
    const c = source.charAt(i);
    if (/\s/.test(c)) {
      i++;
    } else if (c === "/" && source.charAt(i + 1) === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i++;
    } else if (c === "/" && source.charAt(i + 1) === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
    } else if (c === '"' || c === "'") {
      readQuoted(c);
    } else if (c === "`") {
      readTemplate();
    } else if (c === "/" && regexCanStart()) {
      const start = i;
      let inClass = false;
      for (i++; i < source.length; i++) {
        const d = source.charAt(i);
        if (d === "\\") i++;
        else if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;
      }
      for (i++; i < source.length && /[a-z]/i.test(source.charAt(i)); i++);
      tokens.push({ type: "regex", text: source.slice(start, i) });
    } else if (isWord(c)) {
      const start = i;
      while (i < source.length && isWord(source.charAt(i))) i++;
      tokens.push({ type: "word", text: source.slice(start, i) });
    } else {
      const three = source.slice(i, i + 3);
      const two = source.slice(i, i + 2);
      const op = ["===", "!==", "...", "**="].includes(three) ? three : ["=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-="].includes(two) ? two : c;
      tokens.push({ type: "punct", text: op });
      i += op.length;
    }
  }
  return tokens;
}

/** Tokens back to text: comments and formatting gone, a trailing comma dropped, one space only between two words. */
export function render(tokens: Token[]): string {
  let out = "";
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k] as Token;
    if (t.type === "punct" && t.text === "," && /^[)\]}]$/.test(tokens[k + 1]?.text ?? "")) continue;
    const prev = tokens[k - 1];
    if (prev && prev.type !== "punct" && t.type !== "punct" && prev.type !== "str" && t.type !== "str") out += " ";
    out += t.text;
  }
  return out;
}

export function normalize(source: string): string {
  return render(tokenize(source));
}

/** Index of the token that closes the bracket at `open` (by punctuation tokens only), or -1. */
function closingToken(tokens: Token[], open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "${": "}" };
  const stack: string[] = [];
  for (let k = open; k < tokens.length; k++) {
    const t = tokens[k] as Token;
    if (t.type !== "punct") continue;
    if (pairs[t.text]) stack.push(pairs[t.text] as string);
    else if (t.text === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return k;
    }
  }
  return -1;
}

/** Plain data only (strings, regexes, numbers, names, object and array literals): no call, arrow, await or function. */
function plainArguments(tokens: Token[]): boolean {
  return tokens.every((t) => (t.type === "punct" ? !["(", ")", "=>", "${"].includes(t.text) : t.type !== "word" || !CODE_IN_ARGS.has(t.text)));
}

/** The source with every locator chain replaced by one token: what is left is what the test does. */
export function skeleton(source: string): string {
  const tokens = tokenize(source);
  const out: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k] as Token;
    const name = tokens[k + 1];
    if (t.text === "." && name?.type === "word" && LOCATOR_METHODS.has(name.text) && tokens[k + 2]?.text === "(") {
      const end = closingToken(tokens, k + 2);
      if (end > 0 && plainArguments(tokens.slice(k + 3, end))) {
        // A receiver (or an earlier locator call) followed by locator calls is one selector.
        const prev = out.at(-1);
        if (prev?.text === "LOC" || prev?.type === "word") out.pop();
        out.push({ type: "word", text: "LOC" });
        k = end;
        continue;
      }
    }
    out.push(t);
  }
  return render(out);
}

/** Where two skeletons first differ, as a short excerpt of each, for the report. */
export function firstDifference(before: string, after: string): string {
  let i = 0;
  while (i < before.length && i < after.length && before.charAt(i) === after.charAt(i)) i++;
  const cut = (s: string) => s.slice(Math.max(0, i - 30), i + 50);
  return `\`…${cut(before)}…\` became \`…${cut(after)}…\``;
}

/** Ways the source switches a test off, or could hide doing so. */
export function disableProblems(source: string): string[] {
  const tokens = tokenize(source);
  const problems = new Set<string>();
  const quoted = (t: Token) => t.type === "str" && DISABLE_WORDS.has(t.text.slice(1, -1));
  tokens.forEach((t, k) => {
    if ((t.type === "word" && DISABLE_WORDS.has(t.text)) || quoted(t)) problems.add(`uses \`${t.text}\``);
    if (t.type === "word" && DYNAMIC_WORDS.has(t.text)) problems.add(`uses \`${t.text}\` (dynamic access could hide a skip)`);
    // Computed member access (x[...], x()[...]) is allowed only with one plain string or number as the key.
    const prev = tokens[k - 1];
    if (t.text === "[" && prev && (prev.type === "word" || prev.type === "str" || [")", "]"].includes(prev.text)) && !REGEX_AFTER_WORDS.has(prev.text) && !["const", "let", "var"].includes(prev.text)) {
      const key = tokens.slice(k + 1, closingToken(tokens, k));
      // An empty key is a TypeScript array type (`string[]`), not an access.
      const plain = key.length === 0 || (key.length === 1 && (key[0]?.type === "str" || /^\d+$/.test(key[0]?.text ?? "")) && !key[0]?.text.includes("${"));
      if (!plain) problems.add("uses a computed member access (`x[...]`) with something other than one plain key");
    }
  });
  return [...problems];
}

/** Problems of a new spec that keep it from coming in without approval. */
export function newSpecProblems(source: string): string[] {
  const tokens = tokenize(source);
  const problems: string[] = [];
  tokens.forEach((t, k) => {
    const next = tokens[k + 1];
    if (t.type === "word" && (t.text === "from" || t.text === "import") && next?.type === "str" && !/^(["'`])\.\/fixtures(?:\.ts)?\1$/.test(next.text)) {
      problems.push(`imports ${next.text} (only ./fixtures.ts, which holds the isolation)`);
    }
    if (t.type === "word" && ((t.text === "import" && next?.text === "(") || t.text === "require")) problems.push("loads a module at run time");
    if (t.text === "." && next?.type === "word" && NEW_SPEC_METHODS.has(next.text)) problems.push(`calls \`.${next.text}\` (routes, mocks or reconfigures the browser or the run)`);
    if (t.type === "word" && HOOKS.has(t.text)) problems.push(`uses \`${t.text}\` (shared setup is approved like the fixtures)`);
  });
  return [...new Set(problems)];
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
    for (const p of disableProblems(readFileSync(file, "utf-8"))) errors.push(`\`${file}\` skips, focuses or switches off a test, or could hide it: ${p}.`);
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
