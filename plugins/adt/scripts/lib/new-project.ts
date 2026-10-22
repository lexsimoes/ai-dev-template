// The steps behind /adt:new-project. Every step is idempotent: run twice, it creates only what is missing and never
// overwrites what exists (a repository, labels, a ruleset). Commands run without a shell, with validated values only.
// Tested in tests/unit/plugin-new-project.test.ts.

import { LABELS, compareVersions, parseAnswers, parseGitHubRemote, parseTemplateSource, parseVersion } from "./project.ts";
import type { Run } from "./run.ts";

export interface Template {
  repository: string;
  release: string;
  copierVersion: string;
}

export interface Context {
  run: Run;
  /** A file in the project folder (relative path), or null if it does not exist. */
  read: (path: string) => string | null;
}

export type StepStatus = "created" | "exists" | "skipped" | "failed";

export interface Step {
  id: string;
  status: StepStatus;
  detail: string;
}

// ---------- folder ----------

/** Files a fresh folder may already have without holding a project. */
const IGNORABLE = new Set([".git", ".DS_Store", "Thumbs.db", ".idea", ".vscode"]);

export type Folder =
  | { kind: "empty" }
  /** owner and slug from `.copier-answers.yml`, only when they are a valid GitHub username and repository name. */
  | { kind: "adt-project"; release: string; owner: string | null; slug: string | null }
  | { kind: "code"; examples: string[] };

/** File names shown to the user (and so to the conversation): only plain names; the rest are counted. */
const SHOWN_NAME_RE = /^[A-Za-z0-9._ -]{1,60}$/;

/** What the folder holds: nothing (new project), a project from this template (continue its setup), or other code (stop). */
export function inspectFolder(entries: string[], read: (path: string) => string | null, template: Template): Folder {
  const answers = entries.includes(".copier-answers.yml") ? read(".copier-answers.yml") : null;
  if (answers) {
    const a = parseAnswers(answers);
    if (parseTemplateSource(a._src_path ?? "")?.toLowerCase() === template.repository.toLowerCase()) {
      return {
        kind: "adt-project",
        release: parseVersion(a._commit ?? "") ? (a._commit as string) : "an unreleased commit",
        owner: OWNER_RE.test(a.github_owner ?? "") ? (a.github_owner as string) : null,
        slug: SLUG_RE.test(a.project_slug ?? "") ? (a.project_slug as string) : null,
      };
    }
  }
  const other = entries.filter((e) => !IGNORABLE.has(e)).sort();
  if (!other.length) return { kind: "empty" };
  const shown = other.filter((e) => SHOWN_NAME_RE.test(e)).slice(0, 5);
  const rest = other.length - shown.length;
  return { kind: "code", examples: rest ? [...shown, `(${rest} more)`] : shown };
}

/** Suggested project name and slug from the folder name. */
export function suggestNames(folder: string): { name: string; slug: string } {
  const name = folder.trim().slice(0, 60) || "my-project";
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "my-project";
  return { name, slug };
}

// ---------- answers ----------

export const LANGUAGES = ["en", "pt-BR"] as const;
export const REVIEWERS = ["deepseek", "anthropic", "none"] as const;
export const SECTIONS = ["library-docs", "ui-ux"] as const;

export interface Answers {
  name: string;
  slug: string;
  owner: string;
  language: (typeof LANGUAGES)[number];
  reviewer: (typeof REVIEWERS)[number];
  evals: boolean;
  sections: Array<(typeof SECTIONS)[number]>;
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,59}$/u;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Answers from the conversation, checked against closed lists and patterns before they reach Copier or GitHub. */
export function validateAnswers(raw: Record<string, string | undefined>): { answers: Answers } | { errors: string[] } {
  const errors: string[] = [];
  const name = raw.name?.trim() ?? "";
  const slug = raw.slug?.trim() ?? "";
  const owner = raw.owner?.trim() ?? "";
  if (!NAME_RE.test(name)) errors.push("name: 1 to 60 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit");
  if (!SLUG_RE.test(slug)) errors.push("slug: lowercase letters, digits and hyphens (it is also the GitHub repository name)");
  if (!OWNER_RE.test(owner)) errors.push("owner: a GitHub username");
  const language = LANGUAGES.find((l) => l === raw.language);
  if (!language) errors.push(`language: one of ${LANGUAGES.join(", ")}`);
  const reviewer = REVIEWERS.find((r) => r === raw.reviewer);
  if (!reviewer) errors.push(`reviewer: one of ${REVIEWERS.join(", ")}`);
  if (raw.evals !== "true" && raw.evals !== "false") errors.push("evals: true or false");
  const sectionList = (raw.sections ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sections = sectionList.filter((s): s is Answers["sections"][number] => (SECTIONS as readonly string[]).includes(s));
  if (sections.length !== sectionList.length) errors.push(`sections: comma-separated, from ${SECTIONS.join(", ")} (or empty)`);
  if (errors.length || !language || !reviewer) return { errors };
  return { answers: { name, slug, owner, language, reviewer, evals: raw.evals === "true", sections: [...new Set(sections)] } };
}

/** `copier copy` arguments: non-interactive, from the pinned release, into the current folder. */
export function copierArgs(answers: Answers, template: Template): string[] {
  const data: Record<string, string> = {
    project_name: answers.name,
    project_slug: answers.slug,
    github_owner: answers.owner,
    conversation_language: answers.language,
    reviewer_provider: answers.reviewer,
    evals_with_model: String(answers.evals),
    optional_sections: JSON.stringify(answers.sections),
  };
  return [
    "copy",
    "--quiet",
    "--defaults",
    "--vcs-ref",
    template.release,
    ...Object.entries(data).flatMap(([k, v]) => ["--data", `${k}=${v}`]),
    `gh:${template.repository}`,
    ".",
  ];
}

// ---------- preflight ----------

export interface Preflight {
  ok: boolean;
  login: string | null;
  problems: string[];
}

/** Prerequisites: Node 22.18+, git, gh logged in, Copier at the template's version, and the pinned release published. */
export function preflight(ctx: Context, template: Template, nodeVersion: string): Preflight {
  const problems: string[] = [];
  const node = parseVersion(nodeVersion);
  if (!node || compareVersions(node, [22, 18, 0]) < 0) problems.push(`Node.js 22.18 or newer is needed (this is ${nodeVersion}).`);
  if (ctx.run("git", ["--version"]).code !== 0) problems.push("git is not installed (Mac: `xcode-select --install`).");
  let login: string | null = null;
  if (ctx.run("gh", ["--version"]).code !== 0) {
    problems.push("The GitHub CLI is not installed (Mac: `brew install gh`; others: https://cli.github.com).");
  } else {
    const user = ctx.run("gh", ["api", "user", "--jq", ".login"]);
    login = user.code === 0 && OWNER_RE.test(user.stdout.trim()) ? user.stdout.trim() : null;
    if (!login) problems.push("The GitHub CLI is not logged in: run `gh auth login` and choose GitHub.com.");
  }
  const copier = ctx.run("copier", ["--version"]);
  const have = parseVersion(/(\d+\.\d+\.\d+)/.exec(copier.stdout)?.[1] ?? "");
  const want = parseVersion(template.copierVersion);
  if (copier.code !== 0 || !have) problems.push(`Copier is not installed: \`pipx install copier==${template.copierVersion}\` (or \`brew install pipx\` first).`);
  else if (want && compareVersions(have, want) < 0) problems.push(`Copier ${template.copierVersion} or newer is needed: \`pipx install --force copier==${template.copierVersion}\`.`);
  if (login) {
    const release = ctx.run("gh", ["api", `repos/${template.repository}/releases/tags/${template.release}`, "--jq", ".tag_name"]);
    if (release.code !== 0) problems.push(`The template release ${template.release} is not published on ${template.repository} yet; update the plugin (\`/plugin marketplace update ai-dev-template\`) or try again after the release.`);
  }
  return { ok: problems.length === 0, login, problems };
}

// ---------- create ----------

/** Copier into the empty folder, then the first commit. Skips what is already done. */
export function createProject(ctx: Context, answers: Answers, template: Template, folder: Folder): Step[] {
  if (folder.kind === "code") return [{ id: "create", status: "failed", detail: "The folder has other files: nothing was changed." }];
  const steps: Step[] = [];
  if (folder.kind === "adt-project") {
    steps.push({ id: "copier", status: "exists", detail: `Already a project from ${template.repository} (${folder.release}).` });
  } else {
    // A folder that looks empty but whose git repository has commits: pushing it would publish that history.
    if (ctx.run("git", ["rev-parse", "--verify", "-q", "HEAD"]).code === 0) {
      return [{ id: "copier", status: "failed", detail: "This folder's git repository already has commits: nothing was changed. Use a new, empty folder." }];
    }
    const r = ctx.run("copier", copierArgs(answers, template));
    if (r.code !== 0) return [{ id: "copier", status: "failed", detail: `Copier failed: ${firstLine(r.stderr || r.stdout)}` }];
    steps.push({ id: "copier", status: "created", detail: `Project files from ${template.repository} ${template.release}.` });
  }
  if (ctx.run("git", ["rev-parse", "--git-dir"]).code !== 0) {
    const init = ctx.run("git", ["init", "-q", "-b", "main"]);
    if (init.code !== 0) return [...steps, { id: "git", status: "failed", detail: `git init failed: ${firstLine(init.stderr)}` }];
  }
  if (ctx.run("git", ["rev-parse", "--verify", "-q", "HEAD"]).code === 0) {
    steps.push({ id: "commit", status: "exists", detail: "The first commit already exists." });
    return steps;
  }
  const add = ctx.run("git", ["add", "-A"]);
  const commit = add.code === 0 ? ctx.run("git", ["commit", "-q", "-m", `chore: project created from ai-dev-template ${template.release}`]) : add;
  steps.push(
    commit.code === 0
      ? { id: "commit", status: "created", detail: "First commit on `main`." }
      : { id: "commit", status: "failed", detail: `git commit failed: ${firstLine(commit.stderr)} (is \`git config user.name\` / \`user.email\` set?)` },
  );
  return steps;
}

// ---------- setup on GitHub ----------

function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").slice(0, 200);
}

function httpStatus(stderr: string): number {
  return Number(/HTTP (\d{3})/.exec(stderr)?.[1] ?? 0);
}

/** GitHub repository: create it (public or private) and push, or use the one `origin` already points to. Never pushes into a repository it did not create. */
export function setupRepo(ctx: Context, answers: Answers, visibility: "public" | "private"): { slug: string | null; step: Step } {
  const remote = ctx.run("git", ["remote", "get-url", "origin"]);
  if (remote.code === 0) {
    const slug = parseGitHubRemote(remote.stdout);
    if (!slug) return { slug: null, step: { id: "repo", status: "failed", detail: "`origin` is not a GitHub repository: nothing was pushed." } };
    // The user approves a command that names one repository: never act on another one through `origin`.
    const named = `${answers.owner}/${answers.slug}`;
    if (slug.toLowerCase() !== named.toLowerCase()) {
      return { slug: null, step: { id: "repo", status: "failed", detail: `\`origin\` points to ${slug}, not to ${named} as in this command: nothing was pushed or changed.` } };
    }
    if (ctx.run("gh", ["api", `repos/${slug}`, "--jq", ".full_name"]).code !== 0) {
      return { slug: null, step: { id: "repo", status: "failed", detail: `\`origin\` points to ${slug}, which does not exist or you cannot see.` } };
    }
    if (ctx.run("gh", ["api", `repos/${slug}/branches/main`, "--jq", ".name"]).code !== 0) {
      const push = ctx.run("git", ["push", "-u", "origin", "main"]);
      if (push.code !== 0) return { slug, step: { id: "repo", status: "failed", detail: `Pushing to ${slug} failed: ${firstLine(push.stderr)}` } };
      return { slug, step: { id: "repo", status: "created", detail: `${slug} existed; the first commit was pushed.` } };
    }
    return { slug, step: { id: "repo", status: "exists", detail: `${slug} already exists and has \`main\`.` } };
  }
  const slug = `${answers.owner}/${answers.slug}`;
  const existing = ctx.run("gh", ["api", `repos/${slug}`, "--jq", ".full_name"]);
  if (existing.code === 0) {
    return {
      slug: null,
      step: { id: "repo", status: "failed", detail: `${slug} already exists on GitHub and this folder is not linked to it: nothing was pushed. Choose another name, or link it yourself if it is yours.` },
    };
  }
  if (httpStatus(existing.stderr) !== 404) return { slug: null, step: { id: "repo", status: "failed", detail: `Could not check whether ${slug} exists: ${firstLine(existing.stderr)}` } };
  const create = ctx.run("gh", ["repo", "create", slug, `--${visibility}`, "--source", ".", "--remote", "origin", "--push"]);
  if (create.code !== 0) return { slug: null, step: { id: "repo", status: "failed", detail: `gh repo create failed: ${firstLine(create.stderr)}` } };
  return { slug, step: { id: "repo", status: "created", detail: `${slug} (${visibility}), with the first commit pushed.` } };
}

/** The labels the bots use: creates only the missing ones, never changes existing labels. */
export function setupLabels(ctx: Context, slug: string): Step {
  const list = ctx.run("gh", ["api", "--paginate", `repos/${slug}/labels?per_page=100`, "--jq", ".[].name"]);
  if (list.code !== 0) return { id: "labels", status: "failed", detail: `Could not list the labels: ${firstLine(list.stderr)}` };
  const have = new Set(list.stdout.split("\n").map((l) => l.trim()));
  const missing = LABELS.filter((l) => !have.has(l.name));
  if (!missing.length) return { id: "labels", status: "exists", detail: `All ${LABELS.length} labels already exist.` };
  const failed: string[] = [];
  for (const l of missing) {
    const r = ctx.run("gh", ["label", "create", l.name, "-R", slug, "--color", l.color, "--description", l.description]);
    if (r.code !== 0) failed.push(l.name);
  }
  if (failed.length) return { id: "labels", status: "failed", detail: `Could not create: ${failed.join(", ")}.` };
  return { id: "labels", status: "created", detail: `Created: ${missing.map((l) => l.name).join(", ")}.` };
}

const DEPENDENCY_GRAPH_FIX =
  "Turn it on by hand: **Settings → Code security → Dependency graph: Enable** (and Dependabot alerts: Enable).";

/**
 * The dependency graph, which the `dependencies` check (GitHub's dependency review) needs: without it, that required
 * check fails on every PR. A new repository may not have it; enabling Dependabot alerts turns it on.
 */
export function setupDependencyGraph(ctx: Context, slug: string): Step {
  if (ctx.run("gh", ["api", `repos/${slug}/dependency-graph/sbom`, "--jq", ".sbom.name"]).code === 0) {
    return { id: "dependency-graph", status: "exists", detail: "The dependency graph is on (the `dependencies` check can run)." };
  }
  const enable = ctx.run("gh", ["api", "--method", "PUT", `repos/${slug}/vulnerability-alerts`]);
  if (enable.code === 0) return { id: "dependency-graph", status: "created", detail: "Dependency graph and Dependabot alerts turned on (the `dependencies` check needs them)." };
  return { id: "dependency-graph", status: "failed", detail: `Could not turn on the dependency graph (${firstLine(enable.stderr)}). ${DEPENDENCY_GRAPH_FIX}` };
}

/**
 * The protect-main ruleset from the project's own file, applied through the API. Skipped (with the reason) when one
 * named protect-main exists, or when a private repository's plan does not enforce rulesets.
 */
export function setupRuleset(ctx: Context, slug: string, visibility: "public" | "private", login: string): Step {
  const file = ".github/rulesets/protect-main.json";
  const ruleset = ctx.read(file);
  let name: string;
  try {
    name = (JSON.parse(ruleset ?? "") as { name?: string }).name ?? "";
  } catch {
    return { id: "ruleset", status: "failed", detail: `\`${file}\` is missing or not valid JSON.` };
  }
  const existing = ctx.run("gh", ["api", `repos/${slug}/rulesets`, "--jq", ".[].name"]);
  if (existing.code !== 0) return { id: "ruleset", status: "failed", detail: `Could not list the rulesets: ${firstLine(existing.stderr)}` };
  if (existing.stdout.split("\n").map((n) => n.trim()).includes(name)) {
    return { id: "ruleset", status: "exists", detail: `A ruleset named ${name} already exists: left as it is.` };
  }
  const planNote =
    "On a private repository, rulesets need GitHub Pro or Team: the checks still run on every PR, but nothing blocks a merge with a red check. Make the repository public, or upgrade and run /adt:new-project again in this folder (it adds only what is missing).";
  if (visibility === "private" && slug.toLowerCase().startsWith(`${login.toLowerCase()}/`)) {
    const plan = ctx.run("gh", ["api", "user", "--jq", ".plan.name"]).stdout.trim();
    if (plan === "free") return { id: "ruleset", status: "skipped", detail: planNote };
  }
  const create = ctx.run("gh", ["api", "--method", "POST", `repos/${slug}/rulesets`, "--input", file]);
  if (create.code === 0) return { id: "ruleset", status: "created", detail: `${name}: \`main\` only changes through a PR with the required checks green.` };
  if (visibility === "private" && [403, 422].includes(httpStatus(create.stderr))) return { id: "ruleset", status: "skipped", detail: planNote };
  return { id: "ruleset", status: "failed", detail: `Could not create the ruleset: ${firstLine(create.stderr)}` };
}

/** The secrets the project's config expects (names only), and whether each is required for the checks to be green. */
export function expectedSecrets(read: (path: string) => string | null): Array<{ name: string; required: boolean; why: string }> {
  const parse = <T>(path: string): T | null => {
    try {
      return JSON.parse(read(path) ?? "") as T;
    } catch {
      return null;
    }
  };
  const out: Array<{ name: string; required: boolean; why: string }> = [];
  const review = parse<{ disabled?: string; tiers?: Record<string, { apiKeyEnv?: string }> }>(".github/review.json");
  if (review && !review.disabled) {
    const tiers = review.tiers ?? {};
    const main = tiers.standard?.apiKeyEnv;
    if (main) out.push({ name: main, required: true, why: "the automated review" });
    const deep = tiers.sensitive?.apiKeyEnv;
    if (deep && deep !== main) out.push({ name: deep, required: false, why: "the stronger reviewer on sensitive paths and `deep-review` (optional)" });
  }
  const evals = parse<{ disabled?: string }>("evals/config.json");
  if (evals && !evals.disabled) out.push({ name: "EVAL_API_KEY", required: true, why: "the evals (a separate key, for a test project)" });
  return out.filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.name));
}
