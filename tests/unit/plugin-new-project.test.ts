// /adt:new-project (plugins/adt, template-only): folder modes, answers, Copier arguments and the idempotent setup,
// with fake gh/git/copier. The real run is the adt-sandbox-m7b rehearsal (docs/PLUGIN-TEST.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copierArgs,
  createProject,
  expectedSecrets,
  inspectFolder,
  preflight,
  setupDependencyGraph,
  setupLabels,
  setupRepo,
  setupRuleset,
  suggestNames,
  validateAnswers,
} from "../../plugins/adt/scripts/lib/new-project.ts";
import type { Answers, Context, Template } from "../../plugins/adt/scripts/lib/new-project.ts";
import { LABELS } from "../../plugins/adt/scripts/lib/project.ts";
import type { RunResult } from "../../plugins/adt/scripts/lib/run.ts";

const TEMPLATE: Template = { repository: "lexsimoes/ai-dev-template", release: "v0.1.0", copierVersion: "9.18.2" };
const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = "error"): RunResult => ({ code: 1, stdout: "", stderr });
const ANSWERS: Answers = { name: "Loja da Maria", slug: "loja-da-maria", owner: "maria", language: "pt-BR", reviewer: "none", evals: false, sections: ["ui-ux"] };
const RULESET = JSON.stringify({ name: "protect-main", rules: [] });

/** A fake world that records every command; `responses` maps "cmd args" to a result (default: success). */
function world(responses: Record<string, RunResult> = {}, files: Record<string, string> = {}) {
  const calls: string[] = [];
  const ctx: Context = {
    run: (cmd, args) => {
      const key = `${cmd} ${args.join(" ")}`;
      calls.push(key);
      return responses[key] ?? ok();
    },
    read: (path) => files[path] ?? null,
  };
  return { ctx, calls };
}

test("folder: empty, a project from this template, or other code (stop)", () => {
  const read = (files: Record<string, string>) => (p: string) => files[p] ?? null;
  assert.deepEqual(inspectFolder([], read({}), TEMPLATE), { kind: "empty" });
  assert.deepEqual(inspectFolder([".git", ".DS_Store"], read({}), TEMPLATE), { kind: "empty" }, "git init and Finder files are not a project");
  assert.deepEqual(inspectFolder(["package.json", "src", ".git"], read({}), TEMPLATE), { kind: "code", examples: ["package.json", "src"] });
  const answers = { ".copier-answers.yml": "_commit: v0.1.0\n_src_path: gh:lexsimoes/ai-dev-template\n" };
  assert.deepEqual(inspectFolder([".copier-answers.yml", "src"], read(answers), TEMPLATE), { kind: "adt-project", release: "v0.1.0" });
  const other = { ".copier-answers.yml": "_commit: v1.0.0\n_src_path: gh:someone/other-template\n" };
  assert.equal(inspectFolder([".copier-answers.yml"], read(other), TEMPLATE).kind, "code", "another template's project is not ours to change");
});

test("names suggested from the folder", () => {
  assert.deepEqual(suggestNames("Loja da Maria"), { name: "Loja da Maria", slug: "loja-da-maria" });
  assert.deepEqual(suggestNames("Café Ação!"), { name: "Café Ação!", slug: "cafe-acao" });
});

test("answers: closed lists and patterns; anything else is an error, never a command", () => {
  const good = validateAnswers({ name: "Loja da Maria", slug: "loja-da-maria", owner: "maria", language: "pt-BR", reviewer: "none", evals: "false", sections: "ui-ux" });
  assert.deepEqual(good, { answers: ANSWERS });
  const bad = validateAnswers({ name: "x`; rm -rf /", slug: "Bad Slug", owner: "-x", language: "fr", reviewer: "gpt", evals: "maybe", sections: "foo" });
  assert.ok("errors" in bad);
  assert.equal(bad.errors.length, 7);
  assert.ok("answers" in validateAnswers({ ...{ name: "a", slug: "a", owner: "a", language: "en", reviewer: "deepseek", evals: "true" }, sections: "" }), "no optional sections is fine");
});

test("copier: non-interactive, from the pinned release, with every answer", () => {
  const args = copierArgs(ANSWERS, TEMPLATE);
  assert.deepEqual(args.slice(0, 5), ["copy", "--quiet", "--defaults", "--vcs-ref", "v0.1.0"]);
  assert.deepEqual(args.slice(-2), ["gh:lexsimoes/ai-dev-template", "."]);
  for (const d of ["project_name=Loja da Maria", "github_owner=maria", "conversation_language=pt-BR", "reviewer_provider=none", "evals_with_model=false", 'optional_sections=["ui-ux"]']) {
    assert.ok(args.includes(d), d);
  }
});

test("preflight: each missing prerequisite comes with its command", () => {
  const { ctx } = world({ "copier --version": fail(), "gh api user --jq .login": fail("HTTP 401") });
  const r = preflight(ctx, TEMPLATE, "v22.17.0");
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /Node\.js 22\.18/);
  assert.match(r.problems.join("\n"), /gh auth login/);
  assert.match(r.problems.join("\n"), /pipx install copier==9\.18\.2/);
  const unreleased = world({ "gh api user --jq .login": ok("maria\n"), "copier --version": ok("copier 9.18.2"), "gh api repos/lexsimoes/ai-dev-template/releases/tags/v0.1.0 --jq .tag_name": fail("HTTP 404") });
  assert.match(preflight(unreleased.ctx, TEMPLATE, "v22.18.0").problems.join(), /not published/);
  const good = world({ "gh api user --jq .login": ok("maria\n"), "copier --version": ok("copier 9.18.2") });
  assert.deepEqual(preflight(good.ctx, TEMPLATE, "v22.20.1"), { ok: true, login: "maria", problems: [] });
});

test("create: Copier then the first commit; a second run changes nothing; a folder with code is never touched", () => {
  const first = world({ "git rev-parse --git-dir": fail(), "git rev-parse --verify -q HEAD": fail() });
  const steps = createProject(first.ctx, ANSWERS, TEMPLATE, { kind: "empty" });
  assert.deepEqual(steps.map((s) => `${s.id}:${s.status}`), ["copier:created", "commit:created"]);
  assert.ok(first.calls.some((c) => c.startsWith("copier copy")));
  assert.ok(first.calls.includes("git init -q -b main"));

  const again = world();
  const steps2 = createProject(again.ctx, ANSWERS, TEMPLATE, { kind: "adt-project", release: "v0.1.0" });
  assert.deepEqual(steps2.map((s) => `${s.id}:${s.status}`), ["copier:exists", "commit:exists"]);
  assert.ok(!again.calls.some((c) => c.startsWith("copier") || c.startsWith("git commit")));

  const code = world();
  assert.equal(createProject(code.ctx, ANSWERS, TEMPLATE, { kind: "code", examples: ["src"] })[0]?.status, "failed");
  assert.deepEqual(code.calls, [], "no command at all in a folder with other code");
});

test("repo: creates and pushes when free; never pushes into a repository it did not create; reuses origin", () => {
  const fresh = world({ "git remote get-url origin": fail(), "gh api repos/maria/loja-da-maria --jq .full_name": fail("gh: Not Found (HTTP 404)") });
  const r = setupRepo(fresh.ctx, ANSWERS, "private");
  assert.equal(r.step.status, "created");
  assert.ok(fresh.calls.includes("gh repo create maria/loja-da-maria --private --source . --remote origin --push"));

  const taken = world({ "git remote get-url origin": fail(), "gh api repos/maria/loja-da-maria --jq .full_name": ok("maria/loja-da-maria") });
  const t = setupRepo(taken.ctx, ANSWERS, "public");
  assert.equal(t.step.status, "failed");
  assert.match(t.step.detail, /already exists/);
  assert.ok(!taken.calls.some((c) => c.startsWith("gh repo create") || c.startsWith("git push")), "nothing pushed into someone else's repository");

  const linked = world({ "git remote get-url origin": ok("git@github.com:maria/loja-da-maria.git\n"), "gh api repos/maria/loja-da-maria --jq .full_name": ok("maria/loja-da-maria") });
  assert.equal(setupRepo(linked.ctx, ANSWERS, "public").step.status, "exists");
  assert.ok(!linked.calls.some((c) => c.startsWith("git push")));

  const unpushed = world({ "git remote get-url origin": ok("https://github.com/maria/loja-da-maria\n"), "gh api repos/maria/loja-da-maria/branches/main --jq .name": fail("HTTP 404") });
  assert.equal(setupRepo(unpushed.ctx, ANSWERS, "public").step.status, "created");
  assert.ok(unpushed.calls.includes("git push -u origin main"));
});

test("labels: creates only the missing ones, never edits existing labels", () => {
  const { ctx, calls } = world({ "gh api --paginate repos/maria/shop/labels?per_page=100 --jq .[].name": ok("re-review\nbug\n") });
  const step = setupLabels(ctx, "maria/shop");
  assert.equal(step.status, "created");
  assert.equal(calls.filter((c) => c.startsWith("gh label create")).length, LABELS.length - 1);
  assert.ok(!calls.some((c) => c.includes("--force") || c.startsWith("gh label edit")));
  const all = world({ "gh api --paginate repos/maria/shop/labels?per_page=100 --jq .[].name": ok(LABELS.map((l) => l.name).join("\n")) });
  assert.equal(setupLabels(all.ctx, "maria/shop").status, "exists");
  assert.ok(!all.calls.some((c) => c.startsWith("gh label create")));
});

test("dependency graph: turned on only when off (the dependencies check needs it)", () => {
  const on = world();
  assert.equal(setupDependencyGraph(on.ctx, "maria/shop").status, "exists");
  assert.ok(!on.calls.some((c) => c.includes("--method PUT")));
  const off = world({ "gh api repos/maria/shop/dependency-graph/sbom --jq .sbom.name": fail("HTTP 404") });
  assert.equal(setupDependencyGraph(off.ctx, "maria/shop").status, "created");
  assert.ok(off.calls.includes("gh api --method PUT repos/maria/shop/vulnerability-alerts"));
  const denied = world({ "gh api repos/maria/shop/dependency-graph/sbom --jq .sbom.name": fail("HTTP 404"), "gh api --method PUT repos/maria/shop/vulnerability-alerts": fail("HTTP 403") });
  assert.match(setupDependencyGraph(denied.ctx, "maria/shop").detail, /Settings → Code security/);
});

test("ruleset: applied from the project's file; an existing one is left alone; private + Free is skipped with the reason", () => {
  const files = { ".github/rulesets/protect-main.json": RULESET };
  const fresh = world({ "gh api repos/maria/shop/rulesets --jq .[].name": ok("") }, files);
  assert.equal(setupRuleset(fresh.ctx, "maria/shop", "public", "maria").status, "created");
  assert.ok(fresh.calls.includes("gh api --method POST repos/maria/shop/rulesets --input .github/rulesets/protect-main.json"));

  const exists = world({ "gh api repos/maria/shop/rulesets --jq .[].name": ok("protect-main\n") }, files);
  assert.equal(setupRuleset(exists.ctx, "maria/shop", "public", "maria").status, "exists");
  assert.ok(!exists.calls.some((c) => c.includes("--method POST")), "never overwritten");

  const free = world({ "gh api repos/maria/shop/rulesets --jq .[].name": ok(""), "gh api user --jq .plan.name": ok("free\n") }, files);
  const skipped = setupRuleset(free.ctx, "maria/shop", "private", "maria");
  assert.equal(skipped.status, "skipped");
  assert.match(skipped.detail, /GitHub Pro or Team/);
  assert.ok(!free.calls.some((c) => c.includes("--method POST")));

  const refused = world({ "gh api repos/org/shop/rulesets --jq .[].name": ok(""), "gh api --method POST repos/org/shop/rulesets --input .github/rulesets/protect-main.json": fail("Upgrade to GitHub Pro (HTTP 403)") }, files);
  assert.equal(setupRuleset(refused.ctx, "org/shop", "private", "maria").status, "skipped", "an org's plan cannot be read: the API refusal says it");
});

test("secrets expected by the project's config: names only; none in no-key mode", () => {
  const on = (path: string) =>
    ({
      ".github/review.json": JSON.stringify({ tiers: { standard: { apiKeyEnv: "REVIEW_API_KEY" }, sensitive: { apiKeyEnv: "REVIEW_DEEP_API_KEY" } } }),
      "evals/config.json": "{}",
    })[path] ?? null;
  assert.deepEqual(
    expectedSecrets(on).map((s) => `${s.name}:${s.required}`),
    ["REVIEW_API_KEY:true", "REVIEW_DEEP_API_KEY:false", "EVAL_API_KEY:true"],
  );
  const off = (path: string) => ({ ".github/review.json": JSON.stringify({ disabled: "x", tiers: {} }), "evals/config.json": JSON.stringify({ disabled: "x" }) })[path] ?? null;
  assert.deepEqual(expectedSecrets(off), []);
});
