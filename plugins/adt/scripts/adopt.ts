// /adt:adopt: brings the ai-dev-template workflow into an existing project of the owner's, on a branch, in observe mode.
// Prints JSON for Claude to explain. It never overwrites a file, never works on the base branch, never pushes, never
// merges, and never creates a label before the owner confirms the names.
//
// In the project folder (the owner's own clone, on a new branch made from the product branch):
//   node <plugin>/scripts/adopt.ts fetch                      the pinned template release, cloned into a temporary folder
//   node <plugin>/scripts/adopt.ts plan  --kit DIR <answers>  what would be added, what is identical, what conflicts
//   node <plugin>/scripts/adopt.ts apply --kit DIR <answers> --base BRANCH   writes the files that do not exist yet
//   node <plugin>/scripts/adopt.ts labels <answers>           creates only the missing labels (after the owner's "ok")
//
// <answers>: --owner LOGIN --labels role=name,… --prd PATH --handoff PATH --invariants DIR
//            --eval-command "npm run … -- --mock" --eval-paths GLOB,… --required CHECK,… [--sensitive GLOB,…]

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  adaptReviewConfig,
  adaptText,
  adtConfig,
  codeowners,
  fill,
  invariantOwners,
  placeholderValues,
  planFiles,
  validateAdoptAnswers,
} from "./lib/adopt.ts";
import type { AdoptAnswers, Kit } from "./lib/adopt.ts";
import type { Template } from "./lib/new-project.ts";
import { parseGitHubRemote, parseVersion } from "./lib/project.ts";
import { run } from "./lib/run.ts";

const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf-8")) as Template;
const dir = process.cwd();
const read = (path: string) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf-8") : null);

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

const parsed = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: Object.fromEntries(
        ["kit", "base", "owner", "labels", "prd", "handoff", "invariants", "eval-command", "eval-paths", "required", "sensitive"].map((k) => [k, { type: "string" as const }]),
      ),
    });
  } catch (e) {
    return out({ errors: [e instanceof Error ? e.message.split("\n")[0] : String(e)] }, true);
  }
})();
const { positionals, values: v } = parsed;
const command = positionals[0];

if (command === "fetch") {
  if (!parseVersion(template.release)) out({ errors: ["The plugin pins no released template version."] }, true);
  const target = join(mkdtempSync(join(tmpdir(), "adt-kit-")), "template");
  const clone = run("git", ["clone", "--quiet", "--depth", "1", "--branch", template.release, `https://github.com/${template.repository}.git`, target]);
  if (clone.code !== 0) out({ errors: [`Could not download the template release ${template.release}: ${clone.stderr.trim().split("\n")[0] ?? ""}`] }, true);
  if (!existsSync(join(target, "adopt/kit.json"))) out({ errors: [`The release ${template.release} has no adoption kit (it arrives in a later release).`] }, true);
  out({ kit: target, release: template.release });
}

function answersOrExit(): AdoptAnswers {
  const a = validateAdoptAnswers({
    owner: v.owner,
    labels: v.labels,
    prd: v.prd,
    handoff: v.handoff,
    invariants: v.invariants,
    evalCommand: v["eval-command"],
    evalPaths: v["eval-paths"],
    required: v.required,
    sensitive: v.sensitive,
  });
  if ("errors" in a) out({ errors: a.errors }, true);
  return a.answers;
}

function repoSlug(): string | null {
  const remote = run("git", ["remote", "get-url", "origin"]);
  return remote.code === 0 ? parseGitHubRemote(remote.stdout) : null;
}

/** Every file the kit brings, rendered for this project. AGENTS.md and CODEOWNERS are handled apart (merge, not copy). */
function render(kitDir: string, answers: AdoptAnswers): { files: Record<string, string>; section: string; release: string } {
  const kitText = (path: string) => readFileSync(join(kitDir, path), "utf-8");
  const kit = JSON.parse(kitText("adopt/kit.json")) as Kit;
  // The kit's version: its newest release, marked "+unreleased" when it carries changes after that release.
  const changelog = kitText("CHANGELOG.md");
  const release = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1];
  const pending = /## \[Unreleased\]([\s\S]*?)(?=\n## \[)/.exec(changelog)?.[1]?.trim();
  const released = release ? `v${release}${pending ? "+unreleased" : ""}` : "unreleased";
  const values = placeholderValues(answers, released);
  const files: Record<string, string> = {};
  for (const path of kit.copy) files[path] = path.endsWith(".md") ? adaptText(kitText(path), answers) : kitText(path);
  // The guard's header names the template's npm script; in the project it is run directly.
  if (files["scripts/guard-invariants.ts"]) files["scripts/guard-invariants.ts"] = files["scripts/guard-invariants.ts"].replace("npm run guard:invariants", "node scripts/guard-invariants.ts");
  for (const [path, source] of Object.entries(kit.files)) files[path] = kitText(source);
  for (const [path, source] of Object.entries(kit.workflows)) {
    if (path.endsWith("/adt-evals.yml") && !answers.evals) continue; // no AI code: no evals check yet
    files[path] = fill(kitText(source), values);
  }
  files[".github/review.json"] = adaptReviewConfig(kitText(kit.reviewConfig), kit, answers);
  files[".github/adt.json"] = adtConfig(answers, template.repository, released);
  return { files, section: fill(kitText(kit.agentsSection), values), release: released };
}

function plan(kitDir: string, answers: AdoptAnswers) {
  const { files, section, release } = render(kitDir, answers);
  const prd = answers.paths.prd; // written by Claude from the confirmed PRD, not by the kit
  const owners = read(".github/CODEOWNERS");
  const agents = read("AGENTS.md");
  const slug = repoSlug();
  const existing = slug ? run("gh", ["api", "--paginate", `repos/${slug}/labels?per_page=100`, "--jq", ".[].name"]) : null;
  const names = existing?.code === 0 ? existing.stdout.split("\n").filter(Boolean) : null;
  return {
    release,
    files,
    section,
    actions: planFiles(files, read),
    codeowners: owners === null ? "add" : invariantOwners(owners, answers.paths.invariants).includes(answers.owner.toLowerCase()) ? "covered" : "conflict",
    agents: agents === null ? "create" : agents.includes("## ai-dev-template workflow") ? "already-merged" : "append-section",
    prd: read(prd) === null ? "to-write" : "exists",
    labels: Object.entries(answers.labels).map(([role, name]) => ({ role, name, exists: names ? names.includes(name) : null })),
  };
}

const kitDir = v.kit;
if (command === "plan" || command === "apply") {
  if (!kitDir || !existsSync(join(kitDir, "adopt/kit.json"))) out({ errors: ["--kit: the folder printed by `fetch` (a template checkout with adopt/kit.json)."] }, true);
}

if (command === "plan") {
  const answers = answersOrExit();
  const p = plan(kitDir as string, answers);
  out({ release: p.release, files: p.actions, codeowners: p.codeowners, agents: p.agents, prd: p.prd, labels: p.labels });
}

if (command === "apply") {
  const answers = answersOrExit();
  const git = (...args: string[]) => run("git", args);
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
  const base = v.base?.trim() ?? "";
  const problems: string[] = [];
  if (git("rev-parse", "--is-inside-work-tree").code !== 0) problems.push("This folder is not a git repository.");
  if (!/^[\w./-]{1,100}$/.test(base)) problems.push("--base: the product branch this one was made from.");
  // The default branch as git knows it from origin (e.g. `develop`), besides the usual names.
  const originHead = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").stdout.trim().replace(/^origin\//, "");
  if (branch === base || ["main", "master", "HEAD", originHead].includes(branch)) problems.push("Make a new branch from the product branch first: adoption never writes on the base or default branch.");
  if (git("--no-optional-locks", "status", "--porcelain").stdout.trim()) problems.push("The working tree has changes: commit or discard them first.");
  const p = plan(kitDir as string, answers);
  const conflicts = p.actions.filter((a) => a.action === "conflict").map((a) => a.path);
  if (p.codeowners === "conflict") conflicts.push(".github/CODEOWNERS (no rule makes the owner own the invariants folder)");
  if (conflicts.length) problems.push(`Existing files differ from the kit; nothing was written. Decide each one with the owner: ${conflicts.join(", ")}`);
  if (problems.length) out({ errors: problems }, true);

  const written: string[] = [];
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
    written.push(path);
  };
  for (const a of p.actions) if (a.action === "add") write(a.path, p.files[a.path] ?? "");
  if (p.codeowners === "add") write(".github/CODEOWNERS", codeowners(answers));
  const agents = read("AGENTS.md");
  if (agents === null) write("AGENTS.md", `# AGENTS.md\n${p.section}`);
  else if (p.agents === "append-section") write("AGENTS.md", `${agents.replace(/\n*$/, "\n")}${p.section}`);
  out({ written, skipped: p.actions.filter((a) => a.action === "identical").map((a) => a.path), next: "Write the confirmed PRD, list AGENTS.md conflicts for the owner, run the project's checks, commit." });
}

if (command === "labels") {
  const answers = answersOrExit();
  const slug = repoSlug();
  if (!slug) out({ errors: ["The origin remote is not a GitHub repository."] }, true);
  const existing = run("gh", ["api", "--paginate", `repos/${slug}/labels?per_page=100`, "--jq", ".[].name"]);
  if (existing.code !== 0) out({ errors: ["Could not list the repository's labels."] }, true);
  const names = existing.stdout.split("\n").filter(Boolean);
  const steps = Object.values(answers.labels).map((name) => {
    if (names.includes(name)) return { name, status: "exists" };
    const r = run("gh", ["label", "create", name, "-R", slug as string]);
    return { name, status: r.code === 0 ? "created" : "failed" };
  });
  out({ steps }, steps.some((s) => s.status === "failed"));
}

out({ errors: ["usage: adopt.ts fetch | plan --kit DIR … | apply --kit DIR --base BRANCH … | labels …"] }, true);
