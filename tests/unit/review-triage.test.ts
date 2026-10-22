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
import type { Finding, ReportInput } from "../../scripts/review/lib.ts";

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
