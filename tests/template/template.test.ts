// Tests of the Copier template itself (template-only: excluded from generated projects).
// Needs Copier on PATH (or COPIER=/path/to/copier) and network for `npm ci`. Run: npm run test:template
//
// 1. The .jinja twins render back to this repository's own files when given this repository's answers.
// 2. Two projects with different answers are generated, and each passes its own CI checks.
// 3. No owner of this template leaks into a generated project.
// 4. `copier update` brings a template change into a generated project without overwriting project files.
// 5. Releases: Copier uses the latest release tag (not unreleased commits on main), and `copier update` moves a
//    project from one release to the next (docs/RELEASING.md).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertUsableTiers } from "../unit/review-test-config.ts";

const ROOT = resolve(".");
const COPIER = process.env.COPIER || "copier";
let work = "";

function sh(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
}

function git(cwd: string, ...args: string[]): string {
  return sh("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], cwd);
}

/** This repository's owner, read from its CODEOWNERS (never written into the test). */
function templateOwner(): string {
  const line = readFileSync(join(ROOT, ".github/CODEOWNERS"), "utf-8").split("\n").find((l) => l.startsWith("/tests/invariants/"));
  const owner = line?.split(/\s+/)[1]?.replace(/^@/, "");
  assert.ok(owner, "CODEOWNERS has an owner for /tests/invariants/");
  return owner;
}

/** A clean git copy of the template's current files (committed or not), so Copier sees exactly this working tree. */
function templateRepo(dir: string): string {
  const files = sh("git", ["ls-files", "-co", "--exclude-standard", "-z"], ROOT).split("\0").filter(Boolean);
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue; // deleted but not yet committed
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "template v1");
  return dir;
}

function copy(template: string, dest: string, answers: Record<string, string>): void {
  const data = Object.entries(answers).flatMap(([k, v]) => ["--data", `${k}=${v}`]);
  sh(COPIER, ["copy", "--quiet", "--vcs-ref", "HEAD", "--defaults", ...data, template, dest], ROOT);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .filter((f) => !f.split("/").includes("node_modules") && !f.split("/").includes(".git"))
    .filter((f) => statSync(join(dir, f)).isFile());
}

/** Runs the same commands the project's CI runs (quality + invariants jobs), plus the mock evals. */
function runProjectChecks(dir: string): void {
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "project created");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  sh("npm", ["ci", "--no-audit", "--no-fund"], dir);
  sh("npm", ["run", "check"], dir);
  sh("npm", ["run", "eval:mock"], dir);
  sh("node", ["scripts/guard-invariants.ts"], dir);
}

let template = "";

before(() => {
  work = mkdtempSync(join(tmpdir(), "copier-test-"));
  template = templateRepo(join(work, "template"));
});

after(() => {
  rmSync(work, { recursive: true, force: true });
});

test("twins: rendering with this repository's answers gives back its own files", () => {
  const dest = join(work, "self");
  const language = /\*\*Conversation language:\*\* ([\w-]+)\./.exec(readFileSync(join(ROOT, "AGENTS.md"), "utf-8"))?.[1] ?? "";
  copy(template, dest, {
    project_name: "AI dev template",
    project_slug: "ai-dev-template",
    github_owner: templateOwner(),
    conversation_language: language,
    reviewer_provider: "deepseek",
    evals_with_model: "true",
    optional_sections: '["library-docs", "ui-ux"]',
  });
  for (const f of ["AGENTS.md", ".github/review.json", "evals/config.json"]) {
    assert.equal(readFileSync(join(dest, f), "utf-8"), readFileSync(join(ROOT, f), "utf-8"), `${f}.jinja is out of sync with ${f}`);
  }
  const rules = (p: string) => readFileSync(p, "utf-8").split("\n").filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(rules(join(dest, ".github/CODEOWNERS")), rules(join(ROOT, ".github/CODEOWNERS")), "CODEOWNERS.jinja rules are out of sync");
  const pkg = (p: string) => {
    const json = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown> & { scripts: Record<string, string> };
    delete json.name;
    delete json.description;
    // test:template only exists in the template repository (its tests are not copied into projects).
    delete json.scripts["test:template"];
    return json;
  };
  assert.deepEqual(pkg(join(dest, "package.json")), pkg(join(ROOT, "package.json")), "package.json.jinja is out of sync (apart from name, description and test:template)");
});

const PROJECTS = [
  {
    name: "a",
    answers: { project_name: "Acme Store", github_owner: "acme-owner", conversation_language: "en", reviewer_provider: "none", optional_sections: "[]" },
    sections: { docs: false, ui: false },
    // evals_with_model not answered: its default follows the reviewer (none → no key → evals off).
    evals: false,
  },
  {
    name: "b",
    answers: { project_name: "Loja Teste", github_owner: "maria-dev", conversation_language: "pt-BR", reviewer_provider: "anthropic", optional_sections: '["ui-ux"]' },
    sections: { docs: false, ui: true },
    evals: true,
  },
];

for (const p of PROJECTS) {
  test(`project ${p.name} (${p.answers.conversation_language}, reviewer ${p.answers.reviewer_provider}): generated as answered and its checks pass`, () => {
    const dest = join(work, p.name);
    copy(template, dest, p.answers);

    const agents = readFileSync(join(dest, "AGENTS.md"), "utf-8");
    assert.match(agents, new RegExp(`\\*\\*Conversation language:\\*\\* ${p.answers.conversation_language}\\.`));
    assert.equal(agents.includes("<!-- optional:library-docs -->"), p.sections.docs);
    assert.equal(agents.includes("<!-- optional:ui-ux -->"), p.sections.ui);
    assert.doesNotMatch(agents, /\{\{|\{%/, "no unrendered Jinja");
    assert.equal(agents.match(/^## \d+\. Skills by task type$/m)?.[0], `## ${4 + Number(p.sections.docs) + Number(p.sections.ui)}. Skills by task type`);

    const owners = readFileSync(join(dest, ".github/CODEOWNERS"), "utf-8");
    assert.match(owners, new RegExp(`^/tests/invariants/\\s+@${p.answers.github_owner}$`, "m"), "the guard's owner is the answered owner");

    const review = JSON.parse(readFileSync(join(dest, ".github/review.json"), "utf-8")) as { disabled?: string; tiers: Record<string, { provider: string }> };
    if (p.answers.reviewer_provider === "none") assert.ok(review.disabled, "reviewer marked as disabled");
    else assert.equal(review.disabled, undefined);
    if (p.answers.reviewer_provider === "anthropic") assert.ok(Object.values(review.tiers).every((t) => t.provider === "anthropic"));
    assertUsableTiers(review.tiers as never);
    const evals = JSON.parse(readFileSync(join(dest, "evals/config.json"), "utf-8")) as { disabled?: string };
    assert.equal(Boolean(evals.disabled), !p.evals, "evals off exactly when the project has no eval key");

    assert.match(readFileSync(join(dest, "package.json"), "utf-8"), new RegExp(`"name": "${p.answers.project_name.toLowerCase().replace(" ", "-")}"`));
    assert.match(readFileSync(join(dest, "specs/PRD.md"), "utf-8"), new RegExp(`^# PRD: ${p.answers.project_name}$`, "m"));
    assert.doesNotMatch(readFileSync(join(dest, "specs/PRD.md"), "utf-8"), /Template roadmap/);
    assert.ok(existsSync(join(dest, ".copier-answers.yml")));
    const templateOnly = [
      "copier.yml",
      "tests/template/template.test.ts",
      ".github/workflows/template.yml",
      "LICENSE",
      ".github/workflows/traffic.yml",
      "scripts/traffic",
      "tests/unit/traffic.test.ts",
      "CHANGELOG.md",
      "docs/RELEASING.md",
      "scripts/release",
      "tests/unit/release.test.ts",
      ".claude-plugin",
      "plugins",
      "tests/unit/plugin-check-setup.test.ts",
      "tests/unit/plugin-release.test.ts",
    ];
    for (const f of templateOnly) assert.ok(!existsSync(join(dest, f)), `${f} is template-only`);
    assert.deepEqual(readdirSync(join(dest, "docs/missions")).sort(), ["README.md", "_TEMPLATE.md"], "only the mission template and README, none of the template's missions");
    for (const f of [".gemini/settings.json", ".aider.conf.yml"]) assert.ok(existsSync(join(dest, f)), `${f} (bridge to AGENTS.md) is in the project`);
    assert.deepEqual(filesUnder(dest).filter((f) => f.endsWith(".jinja")), [], "no .jinja file left");
    const notice = readFileSync(join(dest, "THIRD_PARTY_NOTICES.md"), "utf-8");
    assert.match(notice, /Built with ai-dev-template, © Alexandre Simoes\./);
    assert.ok(notice.includes(readFileSync(join(ROOT, "LICENSE"), "utf-8")), "the template's full MIT notice, as in LICENSE");
    assert.match(notice, /does not set the license of this project/);

    runProjectChecks(dest);
  });
}

test("no owner of this template leaks into a generated project", () => {
  const owner = templateOwner().toLowerCase();
  for (const p of PROJECTS) {
    const dir = join(work, p.name);
    const leaks = filesUnder(dir).filter((f) => readFileSync(join(dir, f), "utf-8").toLowerCase().includes(owner));
    assert.deepEqual(leaks, [], `project ${p.name} mentions ${owner}`);
  }
});

test("copier update: brings template changes, keeps project files", () => {
  const tpl = templateRepo(join(work, "template-update"));
  const proj = join(work, "updated");
  copy(tpl, proj, PROJECTS[0]!.answers);
  git(proj, "init", "-q", "-b", "main");
  git(proj, "add", "-A");
  git(proj, "commit", "-qm", "project created");

  // The project changes files it owns.
  const edit = (dir: string, f: string, add: string) => writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf-8") + add);
  edit(proj, "specs/PRD.md", "\nProject-only line.\n");
  edit(proj, "src/pricing.ts", "\n// project-only comment\n");
  edit(proj, "tests/invariants/README.md", "\nProject-only invariant note.\n");
  writeFileSync(join(proj, "LICENSE"), "Proprietary. All rights reserved.\n");
  git(proj, "add", "-A");
  git(proj, "commit", "-qm", "project work");

  // The template changes a template file and the starter versions of project files.
  edit(tpl, "REVIEW.md", "\nTemplate improvement line.\n");
  edit(tpl, "specs/PRD.md.jinja", "\nTemplate-only PRD line.\n");
  edit(tpl, "src/pricing.ts", "\n// template-only comment\n");
  edit(tpl, "THIRD_PARTY_NOTICES.md.jinja", "\nTemplate notice update.\n");
  git(tpl, "commit", "-qam", "template v2");
  const v2 = git(tpl, "rev-parse", "--short", "HEAD").trim();

  sh(COPIER, ["update", "--quiet", "--defaults", "--vcs-ref", "HEAD"], proj);

  const read = (f: string) => readFileSync(join(proj, f), "utf-8");
  assert.match(read("REVIEW.md"), /Template improvement line\./, "template file updated");
  assert.match(read("specs/PRD.md"), /Project-only line\./, "project PRD kept");
  assert.doesNotMatch(read("specs/PRD.md"), /Template-only PRD line\./, "PRD not overwritten");
  assert.match(read("src/pricing.ts"), /project-only comment/, "app code kept");
  assert.doesNotMatch(read("src/pricing.ts"), /template-only comment/, "app code not overwritten");
  assert.match(read("tests/invariants/README.md"), /Project-only invariant note\./, "invariants kept");
  assert.match(read("THIRD_PARTY_NOTICES.md"), /Template notice update\./, "the license notice is kept and follows the template");
  assert.match(read("THIRD_PARTY_NOTICES.md"), /Permission is hereby granted/);
  assert.equal(read("LICENSE"), "Proprietary. All rights reserved.\n", "the project's own license is never touched");
  assert.match(read(".copier-answers.yml"), new RegExp(`_commit: ${v2}`), "answers file points at the new template commit");
});

test("releases: copy uses the latest tag, not unreleased commits; update moves to the next release", () => {
  const tpl = templateRepo(join(work, "template-releases"));
  const edit = (f: string, add: string) => writeFileSync(join(tpl, f), readFileSync(join(tpl, f), "utf-8") + add);
  git(tpl, "tag", "v0.1.0");
  edit("REVIEW.md", "\nReleased in v0.2.0.\n");
  git(tpl, "commit", "-qam", "change for v0.2.0");
  git(tpl, "tag", "v0.2.0");
  edit("REVIEW.md", "\nNot released yet.\n");
  git(tpl, "commit", "-qam", "unreleased change on main");

  const answers = PROJECTS[0]!.answers;
  const data = Object.entries(answers).flatMap(([k, v]) => ["--data", `${k}=${v}`]);
  const latest = join(work, "release-latest");
  sh(COPIER, ["copy", "--quiet", "--defaults", ...data, tpl, latest], ROOT);
  assert.match(readFileSync(join(latest, ".copier-answers.yml"), "utf-8"), /^_commit: v0\.2\.0$/m, "no --vcs-ref: the latest release");
  assert.doesNotMatch(readFileSync(join(latest, "REVIEW.md"), "utf-8"), /Not released yet/, "unreleased commits are not used");

  const pinned = join(work, "release-pinned");
  sh(COPIER, ["copy", "--quiet", "--defaults", "--vcs-ref", "v0.1.0", ...data, tpl, pinned], ROOT);
  assert.match(readFileSync(join(pinned, ".copier-answers.yml"), "utf-8"), /^_commit: v0\.1\.0$/m, "pinned to the requested release");
  git(pinned, "init", "-q", "-b", "main");
  git(pinned, "add", "-A");
  git(pinned, "commit", "-qm", "project created");
  sh(COPIER, ["update", "--quiet", "--defaults"], pinned);
  assert.match(readFileSync(join(pinned, ".copier-answers.yml"), "utf-8"), /^_commit: v0\.2\.0$/m, "update goes to the latest release");
  assert.match(readFileSync(join(pinned, "REVIEW.md"), "utf-8"), /Released in v0\.2\.0\./);
  assert.doesNotMatch(readFileSync(join(pinned, "REVIEW.md"), "utf-8"), /Not released yet/);
});
