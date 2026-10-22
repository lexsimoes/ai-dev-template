// AGENTS.md, "Handle the review": the implementer fixes only obvious findings and lists the rest.
// Planted findings: an obvious one must be a fix candidate; one in a protected path (invariants, golden set,
// migrations, permissions) or a detected secret must be listed, never fixed; a fix commit that touches a
// protected path, goes over the cap or weakens a test must be refused.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_AUTO_FIX,
  FIX_COMMIT_SUBJECT,
  autoFixConfig,
  checkFixCommit,
  composeComment,
  decodeState,
  renderReport,
  reviewCost,
  triageFindings,
} from "../../scripts/review/lib.ts";
import type { AutoFixConfig, Finding, ReportInput } from "../../scripts/review/lib.ts";

const finding = (file: string, extra: Partial<Finding> = {}): Finding => ({
  severity: "important",
  file,
  line: 10,
  title: `finding in ${file}`,
  explanation: "e",
  evidence: "x",
  origin: "model",
  ...extra,
});

const OBVIOUS = finding("src/pricing.ts", { title: "Missing error handling on an invalid date" });
const INVARIANT = finding("tests/invariants/pricing.invariant.test.ts", { severity: "blocking", title: "Assertion too loose" });

test("planted obvious finding is a fix candidate; planted invariant finding is listed, never fixed", () => {
  const [obvious, invariant] = triageFindings([OBVIOUS, INVARIANT], DEFAULT_AUTO_FIX);
  assert.equal(obvious?.bucket, "candidate");
  assert.equal(invariant?.bucket, "list");
  assert.match(invariant?.reason ?? "", /tests\/invariants/);
});

test("golden set, migrations, permissions and a detected secret are listed, never fixed", () => {
  const planted = [
    finding("evals/golden/classify-message.jsonl"),
    finding("evals/config.json", { title: "Threshold too strict" }),
    finding("supabase/migrations/0001_init.sql"),
    finding(".github/workflows/ci.yml"),
    finding(".claude/settings.json"),
    finding(".github/CODEOWNERS"),
    finding("src/config.ts", { origin: "detector", severity: "blocking", title: "Secret in the code" }),
  ];
  for (const t of triageFindings(planted, DEFAULT_AUTO_FIX)) assert.equal(t.bucket, "list", t.file);
  // The PR description and ordinary code stay candidates (the agent still judges whether they are obvious).
  assert.equal(triageFindings([finding("PR", { line: null })], DEFAULT_AUTO_FIX)[0]?.bucket, "candidate");
});

test("the project's config only tightens: it adds protected paths and lowers the caps, never loosens them", () => {
  const tight = autoFixConfig({ autoFix: { neverPaths: ["tests/evals/golden*"], maxFixes: 3, maxFiles: 20 } });
  assert.deepEqual(tight.neverPaths, [...DEFAULT_AUTO_FIX.neverPaths, "tests/evals/golden*"]);
  assert.equal(tight.maxFixes, 3);
  assert.equal(tight.maxFiles, DEFAULT_AUTO_FIX.maxFiles);
  const loose = autoFixConfig({ autoFix: { neverPaths: [], maxFixes: 99, maxFiles: -1 } });
  assert.deepEqual(loose, DEFAULT_AUTO_FIX);
});

test("findings and the reviewer's cost are read from a real reviewer comment", () => {
  const tier = { provider: "openai-compatible" as const, model: "m", apiKeyEnv: "K", pricePerMTok: { input: 1, output: 2 } };
  const report: ReportInput = {
    kind: "full",
    reviewedSha: "a".repeat(40),
    sinceSha: null,
    tierName: "standard",
    tier,
    reason: "r",
    notes: [],
    review: { summary: "s", findings: [OBVIOUS, INVARIANT], previous: [], notReviewed: [], discarded: 0 },
    previous: [],
    secretFindings: [],
    excluded: [],
    ignored: [],
    usage: { inputTokens: 100_000, outputTokens: 10_000 },
    durationMs: 1000,
    error: null,
  };
  const body = composeComment("", renderReport(report), { sha: "a".repeat(40), findings: [OBVIOUS, INVARIANT] });
  const state = decodeState(body);
  assert.equal(state?.findings.length, 2);
  assert.match(reviewCost(body) ?? "", /\$0\.1200/);
  assert.equal(reviewCost("no report here"), null);
});

const chunk = (path: string, lines = "+x") => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, lines].join("\n");
const fix = (files: string[], diff = files.map((f) => chunk(f)).join("\n")) =>
  checkFixCommit({ subject: FIX_COMMIT_SUBJECT, parents: 1, files, diff }, DEFAULT_AUTO_FIX);

test("a fix commit on ordinary code passes", () => {
  assert.deepEqual(fix(["src/pricing.ts", "tests/unit/pricing.test.ts"]), []);
});

test("a fix commit touching a protected path, over the file cap or with another subject is refused", () => {
  assert.match(fix(["tests/invariants/pricing.invariant.test.ts"]).join("\n"), /protected path/);
  assert.match(fix(Array.from({ length: 11 }, (_, i) => `src/f${i}.ts`)).join("\n"), /stop and ask the owner/);
  assert.match(checkFixCommit({ subject: "fix: other", parents: 1, files: [], diff: "" }, DEFAULT_AUTO_FIX).join("\n"), /subject/);
});

test("a merge, a root commit, or a file the diff does not show by its plain name is refused, never passed", () => {
  assert.match(checkFixCommit({ subject: FIX_COMMIT_SUBJECT, parents: 2, files: [], diff: "" }, DEFAULT_AUTO_FIX).join("\n"), /one parent/);
  assert.match(checkFixCommit({ subject: FIX_COMMIT_SUBJECT, parents: 0, files: [], diff: "" }, DEFAULT_AUTO_FIX).join("\n"), /one parent/);
  const quoted = '"tests/invariants/a\\303\\247.test.ts"';
  assert.match(fix([quoted], `diff --git "a/x" "b/x"\n-  expect(a).toBe(1);`).join("\n"), /not readable in the diff/);
});

const testDiff = (lines: string) => chunk("tests/unit/pricing.test.ts", lines);

test("a fix that weakens a test is refused: an assertion removed, or a test skipped", () => {
  assert.match(fix(["tests/unit/pricing.test.ts"], testDiff("-  assert.equal(applyCoupon(100, c), 90);")).join("\n"), /assertion\(s\) removed/);
  assert.match(fix(["tests/unit/pricing.test.ts"], testDiff('+test.skip("coupon", () => {});')).join("\n"), /skipped/);
  // Rewriting an assertion (one out, one in) is not flagged here; the re-review reads the change.
  assert.deepEqual(fix(["tests/unit/pricing.test.ts"], testDiff("-  assert.equal(a, 1);\n+  assert.equal(a, 1, \"msg\");")), []);
});

test("CLI check-fix stops on a planted fix commit that touches the invariants, and passes a clean one", () => {
  const triage = join(dirname(new URL(import.meta.url).pathname), "../../scripts/review/triage.ts");
  const repo = mkdtempSync(join(tmpdir(), "triage-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    mkdirSync(join(repo, "src"));
    mkdirSync(join(repo, "tests/invariants"), { recursive: true });
    writeFileSync(join(repo, "src/a.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "tests/invariants/a.test.ts"), "// rule\n");
    git("add", "-A");
    git("commit", "-q", "-m", "chore: start");

    writeFileSync(join(repo, "src/a.ts"), "export const a = 2;\n");
    git("commit", "-q", "-am", FIX_COMMIT_SUBJECT);
    const clean = spawnSync(process.execPath, [triage, "check-fix"], { cwd: repo, encoding: "utf-8" });
    assert.equal(clean.status, 0, clean.stdout);

    writeFileSync(join(repo, "tests/invariants/a.test.ts"), "// rule, loosened\n");
    git("commit", "-q", "-am", FIX_COMMIT_SUBJECT);
    const planted = spawnSync(process.execPath, [triage, "check-fix"], { cwd: repo, encoding: "utf-8" });
    assert.equal(planted.status, 1);
    assert.match(planted.stdout, /tests\/invariants\/a\.test\.ts: protected path/);

    // A config that cannot be parsed stops the command instead of silently dropping the project's protected paths.
    mkdirSync(join(repo, ".github"));
    writeFileSync(join(repo, ".github/review.json"), "{ not json");
    const broken = spawnSync(process.execPath, [triage, "check-fix", "--commit", "HEAD~1"], { cwd: repo, encoding: "utf-8" });
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /not valid JSON/);
    rmSync(join(repo, ".github"), { recursive: true });

    // A name with accents (git quotes it by default) is still a protected path.
    writeFileSync(join(repo, "tests/invariants/autenticação.test.ts"), "// rule\n");
    git("add", "-A");
    git("commit", "-q", "-m", FIX_COMMIT_SUBJECT);
    const accented = spawnSync(process.execPath, [triage, "check-fix"], { cwd: repo, encoding: "utf-8" });
    assert.equal(accented.status, 1);
    assert.match(accented.stdout, /autenticação\.test\.ts: protected path/);

    // A merge that brings a change to the invariants is refused, not passed with "0 files".
    git("switch", "-q", "-c", "side", "HEAD~1");
    writeFileSync(join(repo, "tests/invariants/a.test.ts"), "// rule, emptied\n");
    git("commit", "-q", "-am", "chore: side");
    git("switch", "-q", "main");
    git("merge", "-q", "--no-ff", "-X", "theirs", "-m", FIX_COMMIT_SUBJECT, "side");
    const merge = spawnSync(process.execPath, [triage, "check-fix"], { cwd: repo, encoding: "utf-8" });
    assert.equal(merge.status, 1);
    assert.match(merge.stdout, /one parent/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the rule is written in AGENTS.md, with the commands that check it", () => {
  const text = readFileSync("AGENTS.md", "utf-8");
  assert.ok(text.includes(FIX_COMMIT_SUBJECT), "fix commit subject");
  assert.ok(text.includes("scripts/review/triage.ts findings"), "triage command");
  assert.ok(text.includes("scripts/review/triage.ts check-fix"), "check-fix command");
});

test("AGENTS.md, REVIEW.md, the invariant guard and the eval thresholds are never auto-fixed", () => {
  for (const file of ["AGENTS.md", "REVIEW.md", "scripts/guard-invariants.ts", "evals/config.json"]) {
    assert.equal(triageFindings([finding(file)], DEFAULT_AUTO_FIX)[0]?.bucket, "list", file);
  }
  const config = autoFixConfig(JSON.parse(readFileSync(".github/review.json", "utf-8")) as { autoFix?: Partial<AutoFixConfig> });
  assert.deepEqual([...config.neverPaths].sort(), [...DEFAULT_AUTO_FIX.neverPaths].sort(), "the config mirrors the defaults");
});

/** The "Review-fix guard" step of .github/workflows/ci.yml, as the shell runs it. */
function reviewFixStep(): string {
  const lines = readFileSync(".github/workflows/ci.yml", "utf-8").split("\n");
  const start = lines.findIndex((l) => /- name: Review-fix guard/.test(l));
  assert.ok(start >= 0, "the step exists in ci.yml");
  const run = lines.findIndex((l, i) => i > start && /^\s*run: \|\s*$/.test(l));
  assert.ok(run > start, "the step has a run block");
  // The block is every following line indented deeper than `run:` (blank lines included), whatever the indentation.
  const keyIndent = (lines[run] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= keyIndent) break;
    body.push(line);
  }
  const indent = Math.min(...body.filter((l) => l.trim() !== "").map((l) => l.search(/\S/)));
  return body.map((l) => l.slice(indent)).join("\n");
}

test("CI runs check-fix, from the target branch, on every fix commit of the PR", () => {
  const root = process.cwd();
  const repo = mkdtempSync(join(tmpdir(), "review-fix-ci-"));
  const runnerTemp = mkdtempSync(join(tmpdir(), "runner-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    const step = (head: string) =>
      spawnSync("bash", ["-e", "-c", reviewFixStep()], {
        cwd: repo,
        encoding: "utf-8",
        env: { ...process.env, BASE_REF: "main", HEAD_SHA: head, RUNNER_TEMP: runnerTemp },
      });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    mkdirSync(join(repo, "scripts/review"), { recursive: true });
    mkdirSync(join(repo, "tests/invariants"), { recursive: true });
    for (const f of ["scripts/review/triage.ts", "scripts/review/lib.ts"]) writeFileSync(join(repo, f), readFileSync(join(root, f)));
    writeFileSync(join(repo, "src.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "tests/invariants/a.test.ts"), "// rule\n");
    git("add", "-A");
    git("commit", "-q", "-m", "chore: start");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("switch", "-q", "-c", "pr");

    writeFileSync(join(repo, "src.ts"), "export const a = 2;\n");
    git("commit", "-q", "-am", "feat: change");
    const none = step("HEAD");
    assert.equal(none.status, 0, none.stdout + none.stderr);
    assert.match(none.stdout, /No "fix: address review findings" commit/);

    writeFileSync(join(repo, "src.ts"), "export const a = 3;\n");
    git("commit", "-q", "-am", FIX_COMMIT_SUBJECT);
    const clean = step("HEAD");
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /^OK: /m);

    // A planted fix commit that loosens an invariant fails the step, even with a clean fix commit after it.
    writeFileSync(join(repo, "tests/invariants/a.test.ts"), "// rule, loosened\n");
    git("commit", "-q", "-am", FIX_COMMIT_SUBJECT);
    writeFileSync(join(repo, "src.ts"), "export const a = 4;\n");
    git("commit", "-q", "-am", FIX_COMMIT_SUBJECT);
    const planted = step("HEAD");
    assert.equal(planted.status, 1, planted.stdout);
    assert.match(planted.stdout, /tests\/invariants\/a\.test\.ts: protected path/);

    // A message whose first paragraph spans two lines shows on GitHub as the fix subject: it is checked, and refused.
    git("reset", "-q", "--hard", "HEAD~2");
    writeFileSync(join(repo, "src.ts"), "export const a = 5;\n");
    git("commit", "-q", "-am", `${FIX_COMMIT_SUBJECT}\nsecond line`);
    const twoLines = step("HEAD");
    assert.equal(twoLines.status, 1, twoLines.stdout);
    assert.match(twoLines.stdout, /subject must be exactly/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runnerTemp, { recursive: true, force: true });
  }
});
