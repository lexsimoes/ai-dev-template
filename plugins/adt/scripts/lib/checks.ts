// The checks behind /adt:check-setup. Each one says pass, warn, fail or skip, and how to fix it.
// Read-only: nothing here changes GitHub or the project. Secrets are listed by name only; values are never read.
// The report goes into the Claude Code conversation, so text from project files or GitHub enters it only after
// matching a closed pattern (`shown`): a crafted file or API answer cannot put instructions there.
// Tested in tests/unit/plugin-check-setup.test.ts with a fake `gh`.

import {
  ACTIONS_APP_ID,
  DEFAULT_REQUIRED_CHECKS,
  LABELS,
  SECRET_NAME_RE,
  compareVersions,
  parseAnswers,
  parseGitHubRemote,
  parseTemplateSource,
  parseVersion,
  requiredChecksOf,
} from "./project.ts";
import type { Run } from "./run.ts";

export type Status = "pass" | "warn" | "fail" | "skip";

export interface Check {
  id: string;
  title: string;
  status: Status;
  detail: string;
  /** What to do, when the status is not pass. */
  fix?: string;
}

export interface Context {
  run: Run;
  /** A project file (path relative to the project root), or null if it does not exist. */
  read: (path: string) => string | null;
}

interface RepoInfo {
  slug: string;
  private: boolean;
  defaultBranch: string;
  /** The default branch as shown in the report (a safe name, or a description). */
  branchLabel: string;
}

const COMMIT_RE = /^(?:v?\d+\.\d+\.\d+|[0-9a-f]{7,40})$/i;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;
const CHECK_NAME_RE = /^[A-Za-z0-9 ._()/-]{1,100}$/;
const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;
const RUN_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9._/-]+$/;
const WORD_RE = /^[a-z_]{1,30}$/;

/** A value from a project file or from GitHub, as code in the report, or `fallback` if it does not match `re`. */
function shown(value: unknown, re: RegExp, fallback: string): string {
  return typeof value === "string" && re.test(value) ? `\`${value}\`` : fallback;
}

const SECRET_HINT =
  "Set it in **your own terminal**, not in the chat and not with Claude Code's `!` (its output goes into the conversation): `gh secret set NAME -R OWNER/REPO`. It asks for the value without showing it. Set a spending limit at the provider first.";

function json<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** `gh api` call: the parsed JSON, or the HTTP status GitHub answered (0 if none). The error text is ours, never GitHub's. */
function ghApi<T>(ctx: Context, path: string): { ok: true; data: T } | { ok: false; status: number; error: string } {
  const r = ctx.run("gh", ["api", path]);
  if (r.code === 0) {
    const data = json<T>(r.stdout);
    if (data !== null) return { ok: true, data };
    return { ok: false, status: 0, error: "the answer was not JSON" };
  }
  const status = Number(/HTTP (\d{3})/.exec(r.stderr)?.[1] ?? 0);
  return { ok: false, status, error: status ? `HTTP ${status}` : "no answer from GitHub" };
}

/** A project JSON file: absent, present but invalid, or parsed. */
function readJson<T>(ctx: Context, path: string): { state: "absent" } | { state: "invalid" } | { state: "ok"; data: T } {
  const text = ctx.read(path);
  if (text === null) return { state: "absent" };
  const data = json<T>(text);
  return data === null || typeof data !== "object" ? { state: "invalid" } : { state: "ok", data };
}

function checkGh(ctx: Context): { login: string | null; checks: Check[] } {
  if (ctx.run("gh", ["--version"]).code !== 0) {
    return {
      login: null,
      checks: [
        {
          id: "gh",
          title: "GitHub CLI",
          status: "fail",
          detail: "`gh` is not installed or not on the PATH.",
          fix: "Install it (Mac: `brew install gh`; others: https://cli.github.com), then run `gh auth login`.",
        },
      ],
    };
  }
  // The API answering is the real test of being logged in (`gh auth status` can disagree, e.g. behind a proxy).
  const user = ctx.run("gh", ["api", "user", "--jq", ".login"]);
  const login = user.code === 0 ? user.stdout.trim() : "";
  if (user.code === 0 && LOGIN_RE.test(login)) {
    return { login, checks: [{ id: "gh", title: "GitHub CLI", status: "pass", detail: `Logged in as @${login}.` }] };
  }
  const authProblem = /HTTP 401|gh auth login|not logged|authenticat/i.test(user.stderr);
  return {
    login: null,
    checks: [
      authProblem
        ? { id: "gh", title: "GitHub CLI", status: "fail", detail: "`gh` is not logged in to GitHub.com (or its login expired).", fix: "Run `gh auth login` and choose GitHub.com." }
        : {
            id: "gh",
            title: "GitHub CLI",
            status: "fail",
            detail: `\`gh\` could not reach GitHub (${/HTTP (\d{3})/.exec(user.stderr)?.[0] ?? "no answer"}).`,
            fix: "Check the internet connection (or proxy) and run the check again. `gh auth status` shows what `gh` sees.",
          },
    ],
  };
}

function checkRepo(ctx: Context): { repo: RepoInfo | null; check: Check } {
  const remote = ctx.run("git", ["remote", "get-url", "origin"]);
  const slug = remote.code === 0 ? parseGitHubRemote(remote.stdout) : null;
  if (!slug) {
    return {
      repo: null,
      check: {
        id: "repo",
        title: "GitHub repository",
        status: "fail",
        detail: remote.code === 0 ? "The `origin` remote is not a GitHub repository." : "This folder has no `origin` remote (or is not a git repository).",
        fix: "Create it and push the first commit: `gh repo create NAME --private --source . --push` (or `--public`).",
      },
    };
  }
  const info = ghApi<{ private: boolean; default_branch: string }>(ctx, `repos/${slug}`);
  if (!info.ok) {
    return {
      repo: null,
      check: {
        id: "repo",
        title: "GitHub repository",
        status: "fail",
        detail: `\`${slug}\` was not found, or your login cannot see it (${info.error}).`,
        fix: "Check `git remote -v` and that `gh auth status` shows the account that owns the repository.",
      },
    };
  }
  return {
    repo: {
      slug,
      private: info.data.private === true,
      defaultBranch: info.data.default_branch,
      branchLabel: shown(info.data.default_branch, BRANCH_RE, "the default branch"),
    },
    check: { id: "repo", title: "GitHub repository", status: "pass", detail: `\`${slug}\` (${info.data.private ? "private" : "public"}).` },
  };
}

function checkLabels(ctx: Context, repo: RepoInfo): Check {
  const r = ctx.run("gh", ["api", "--paginate", `repos/${repo.slug}/labels?per_page=100`, "--jq", ".[].name"]);
  if (r.code !== 0) return { id: "labels", title: "Labels", status: "skip", detail: "Could not list the labels." };
  const have = new Set(r.stdout.split("\n").map((l) => l.trim()));
  const missing = LABELS.filter((l) => !have.has(l.name));
  if (!missing.length) return { id: "labels", title: "Labels", status: "pass", detail: `All ${LABELS.length} labels exist.` };
  return {
    id: "labels",
    title: "Labels",
    status: "fail",
    detail: `Missing: ${missing.map((l) => `\`${l.name}\``).join(", ")}. The reviewer and the guards need them.`,
    fix: missing.map((l) => `\`gh label create ${l.name} -R ${repo.slug} --color ${l.color} --description "${l.description}"\``).join("\n"),
  };
}

function checkDependencyGraph(ctx: Context, repo: RepoInfo): Check {
  // GitHub's dependency review needs Advanced Security in a private repository: the project's CI runs npm audit there.
  if (repo.private) {
    if (/checker=base\/scripts\/dependency-audit\.ts/.test(ctx.read(".github/workflows/ci.yml") ?? "")) {
      return { id: "dependency-graph", title: "Dependency graph", status: "pass", detail: "Private repository: the `dependencies` check runs npm audit on what each PR introduces." };
    }
    return {
      id: "dependency-graph",
      title: "Dependency graph",
      status: "fail",
      detail: "Private repository: GitHub's dependency review needs Advanced Security, so the `dependencies` check fails on every PR with \"Dependency review is not supported on this repository\".",
      fix: "Update the project from the template (`copier update --defaults`, v0.4.0 or later): its CI runs npm audit in private repositories. Or turn on GitHub Advanced Security for the repository (paid).",
    };
  }
  if (ctx.run("gh", ["api", `repos/${repo.slug}/dependency-graph/sbom`, "--jq", ".sbom.name"]).code === 0) {
    return { id: "dependency-graph", title: "Dependency graph", status: "pass", detail: "On: the `dependencies` check can run." };
  }
  return {
    id: "dependency-graph",
    title: "Dependency graph",
    status: "fail",
    detail: "Off (or not built yet): the `dependencies` check fails on every PR with \"Dependency review is not supported on this repository\".",
    fix: `**Settings → Code security → Dependency graph: Enable** (and Dependabot alerts), or in your terminal: \`gh api --method PUT repos/${repo.slug}/vulnerability-alerts\`. Then re-run the failed \`dependencies\` job.`,
  };
}

function checkRuleset(ctx: Context, repo: RepoInfo, login: string | null): Check {
  const file = ctx.read(".github/rulesets/protect-main.json");
  const listed = file ? (requiredChecksOf(json(file)) ?? []) : [];
  const fromFile = listed.filter((c) => CHECK_NAME_RE.test(c));
  const expected = fromFile.length ? fromFile : DEFAULT_REQUIRED_CHECKS;
  // Names that cannot be shown safely are not checked; the report says how many, so a gap is never silent.
  const ignored = listed.length - fromFile.length;
  const ignoredNote = ignored
    ? ` ${ignored} required check name(s) in \`.github/rulesets/protect-main.json\` use characters this check does not accept, so they were not checked${fromFile.length ? "" : " (the template's default list was checked instead)"}.`
    : "";
  const fix =
    "Run `/adt:new-project` again in this folder (it adds only what is missing), or import `.github/rulesets/protect-main.json` by hand: **Settings → Rules → Rulesets → New ruleset → Import a ruleset**, check that it is **Active** on the default branch, then **Create**.";
  const rules = ghApi<Array<{ type: string; parameters?: { required_status_checks?: Array<{ context: string; integration_id?: number }> } }>>(
    ctx,
    `repos/${repo.slug}/rules/branches/${encodeURIComponent(repo.defaultBranch)}`,
  );
  if (!rules.ok) return { id: "ruleset", title: "Protection of `main`", status: "skip", detail: `Could not read the rules (${rules.error}).` };
  const required = rules.data.filter((r) => r.type === "required_status_checks").flatMap((r) => r.parameters?.required_status_checks ?? []);
  const hasPr = rules.data.some((r) => r.type === "pull_request");
  if (rules.data.length === 0 && repo.private) {
    const plan = login ? ctx.run("gh", ["api", "user", "--jq", ".plan.name"]).stdout.trim() : "";
    const owned = login !== null && repo.slug.toLowerCase().startsWith(`${login.toLowerCase()}/`);
    if (owned && plan === "free") {
      return {
        id: "ruleset",
        title: "Protection of `main`",
        status: "warn",
        detail: "Private repository on the Free plan: GitHub does not enforce rulesets here. The checks still run on every PR, but nothing stops a merge with a red check.",
        fix: "Either make the repository public, or upgrade to GitHub Pro and then import the ruleset. Until then, never merge with a red check.",
      };
    }
  }
  const missing = expected.filter((c) => !required.some((r) => r.context === c));
  const foreign = required.filter((r) => expected.includes(r.context) && r.integration_id !== undefined && r.integration_id !== ACTIONS_APP_ID);
  if (!rules.data.length) {
    return {
      id: "ruleset",
      title: "Protection of `main`",
      status: "fail",
      detail: `${repo.branchLabel} has no active rules: anyone (agents included) can push to it or merge with red checks.${repo.private ? " On a private repository this needs GitHub Pro or Team." : ""}`,
      fix,
    };
  }
  if (!hasPr || missing.length || foreign.length) {
    const problems = [
      ...(hasPr ? [] : ["changes do not have to go through a PR"]),
      ...(missing.length ? [`not required: ${missing.map((c) => `\`${c}\``).join(", ")}`] : []),
      ...(foreign.length ? [`not tied to GitHub Actions: ${foreign.map((c) => `\`${c.context}\``).join(", ")}`] : []),
    ];
    return { id: "ruleset", title: "Protection of `main`", status: "fail", detail: `The rules on ${repo.branchLabel} are incomplete: ${problems.join("; ")}.`, fix };
  }
  const passed = `PR required; required checks: ${expected.map((c) => `\`${c}\``).join(", ")}.`;
  if (ignoredNote) {
    return { id: "ruleset", title: "Protection of `main`", status: "warn", detail: passed + ignoredNote, fix: "Check those names on GitHub (**Settings → Rules → Rulesets → protect-main**): letters, digits, spaces and `._()/-` only." };
  }
  return { id: "ruleset", title: "Protection of `main`", status: "pass", detail: passed };
}

function checkSecretsAndConfig(ctx: Context, repo: RepoInfo): Check[] {
  const listed = ctx.run("gh", ["secret", "list", "-R", repo.slug, "--json", "name", "--jq", ".[].name"]);
  const secrets = listed.code === 0 ? new Set(listed.stdout.split("\n").map((s) => s.trim()).filter((s) => SECRET_NAME_RE.test(s))) : null;
  const out: Check[] = [
    secrets
      ? { id: "secrets", title: "Secrets", status: "pass", detail: secrets.size ? `Present (names only): ${[...secrets].map((s) => `\`${s}\``).join(", ")}.` : "No secrets." }
      : { id: "secrets", title: "Secrets", status: "skip", detail: "Could not list the secrets (only the repository's admins can). The reviewer and evals checks below are skipped." },
  ];
  if (!secrets) return out;
  // Functions as replacements: a `$` in a value is never read as a replacement pattern.
  const fixFor = (name: string) => SECRET_HINT.replace("NAME", () => name).replace("OWNER/REPO", () => repo.slug);

  const reviewFile = readJson<{ disabled?: string; tiers?: Record<string, { apiKeyEnv?: string }> }>(ctx, ".github/review.json");
  const review = reviewFile.state === "ok" ? reviewFile.data : null;
  if (reviewFile.state === "invalid") {
    out.push(invalidJson("review-config", "Reviewer", ".github/review.json", "the `review` check fails on every PR"));
  } else if (!review) {
    out.push({ id: "review-config", title: "Reviewer", status: "skip", detail: "No `.github/review.json` in this project." });
  } else if (review.disabled) {
    out.push(
      secrets.has("REVIEW_API_KEY")
        ? {
            id: "review-config",
            title: "Reviewer",
            status: "warn",
            detail: "No-key mode (`disabled` in `.github/review.json`), but `REVIEW_API_KEY` exists: the key is not used.",
            fix: "To turn the AI review on, open a PR that removes `disabled` from `.github/review.json` (docs/WORKFLOW.md, \"No-key mode\").",
          }
        : { id: "review-config", title: "Reviewer", status: "pass", detail: "No-key mode: the `review` check passes with an \"off\" notice; the secret detectors still run." },
    );
  } else if (Object.values(review.tiers ?? {}).some((t) => t.apiKeyEnv !== undefined && !SECRET_NAME_RE.test(t.apiKeyEnv))) {
    // The names go into commands the user copies: a name that is not a valid secret name is never shown as one.
    out.push({
      id: "review-config",
      title: "Reviewer",
      status: "fail",
      detail: "`.github/review.json` has an `apiKeyEnv` that is not a valid secret name (letters, digits and `_`).",
      fix: "Fix `apiKeyEnv` in `.github/review.json` in a PR (e.g. `REVIEW_API_KEY`).",
    });
  } else {
    const tiers = review.tiers ?? {};
    const needed = [...new Set(["standard", "light"].map((t) => tiers[t]?.apiKeyEnv).filter((k): k is string => Boolean(k)))];
    const optional = [...new Set(["sensitive", "deep"].map((t) => tiers[t]?.apiKeyEnv).filter((k): k is string => Boolean(k) && !needed.includes(k as string)))];
    const missing = needed.filter((k) => !secrets.has(k));
    const missingOptional = optional.filter((k) => !secrets.has(k));
    if (missing.length) {
      out.push({
        id: "review-config",
        title: "Reviewer",
        status: "fail",
        detail: `The review is on, but ${missing.map((k) => `\`${k}\``).join(", ")} is missing: the \`review\` check will be red on every PR.`,
        fix: `${missing.map(fixFor).join("\n")}\nNo key? Turn on no-key mode instead (docs/WORKFLOW.md, "No-key mode").`,
      });
    } else if (missingOptional.length) {
      out.push({
        id: "review-config",
        title: "Reviewer",
        status: "warn",
        detail: `The review is on; ${missingOptional.map((k) => `\`${k}\``).join(", ")} is missing, so sensitive paths and \`deep-review\` fall back to the standard reviewer (the report says so).`,
        fix: missingOptional.map(fixFor).join("\n"),
      });
    } else {
      out.push({ id: "review-config", title: "Reviewer", status: "pass", detail: `The review is on and its keys exist (${[...needed, ...optional].map((k) => `\`${k}\``).join(", ")}).` });
    }
  }

  const evalsFile = readJson<{ disabled?: string }>(ctx, "evals/config.json");
  const evals = evalsFile.state === "ok" ? evalsFile.data : null;
  if (evalsFile.state === "invalid") {
    out.push(invalidJson("evals-config", "Evals", "evals/config.json", "the `evals` check fails on PRs that touch AI files"));
  } else if (!evals) {
    out.push({ id: "evals-config", title: "Evals", status: "skip", detail: "No `evals/config.json` in this project." });
  } else if (evals.disabled) {
    out.push({ id: "evals-config", title: "Evals", status: "pass", detail: "No-key mode: the `evals` check passes with an \"off\" notice; the golden set guard still runs." });
  } else if (!secrets.has("EVAL_API_KEY")) {
    out.push({
      id: "evals-config",
      title: "Evals",
      status: "fail",
      detail: "The evals are on, but `EVAL_API_KEY` is missing: every PR that touches AI files will have a red `evals` check.",
      fix: `${fixFor("EVAL_API_KEY")} Use a separate key from the reviewer's, for a test project.\nNo key? Turn on no-key mode instead (docs/WORKFLOW.md, "No-key mode").`,
    });
  } else {
    out.push({ id: "evals-config", title: "Evals", status: "pass", detail: "The evals are on and `EVAL_API_KEY` exists." });
  }
  return out;
}

function invalidJson(id: string, title: string, path: string, effect: string): Check {
  return { id, title, status: "fail", detail: `\`${path}\` exists but is not valid JSON: ${effect}.`, fix: `Fix \`${path}\` in a PR (\`node -e 'JSON.parse(require("fs").readFileSync("${path}","utf8"))'\` shows where it breaks).` };
}

function checkCi(ctx: Context, repo: RepoInfo): Check {
  const runs = ghApi<{ workflow_runs: Array<{ status: string; conclusion: string | null; html_url: string; head_sha: string }> }>(
    ctx,
    `repos/${repo.slug}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(repo.defaultBranch)}&event=push&per_page=1`,
  );
  if (!runs.ok) {
    return runs.status === 404
      ? { id: "ci", title: `CI on ${repo.branchLabel}`, status: "skip", detail: "No `.github/workflows/ci.yml` on GitHub yet (push the first commit)." }
      : { id: "ci", title: `CI on ${repo.branchLabel}`, status: "skip", detail: `Could not read the CI runs (${runs.error}).` };
  }
  const last = runs.data.workflow_runs[0];
  if (!last) {
    return {
      id: "ci",
      title: `CI on ${repo.branchLabel}`,
      status: "warn",
      detail: "CI has not run on the default branch yet.",
      fix: "It runs on every push to the default branch; push (or merge a PR) and check again.",
    };
  }
  const link = typeof last.html_url === "string" && RUN_URL_RE.test(last.html_url) ? `: ${last.html_url}` : ".";
  if (last.status !== "completed") return { id: "ci", title: `CI on ${repo.branchLabel}`, status: "warn", detail: `The last run is still ${shown(last.status, WORD_RE, "running")}${link}`, fix: "Check again in a few minutes." };
  if (last.conclusion === "success") return { id: "ci", title: `CI on ${repo.branchLabel}`, status: "pass", detail: `Green on ${shown(last.head_sha?.slice(0, 7), COMMIT_RE, "the latest commit")}.` };
  return {
    id: "ci",
    title: `CI on ${repo.branchLabel}`,
    status: "fail",
    detail: `The last run ended with ${shown(last.conclusion, WORD_RE, "a failure")}${link}`,
    fix: "Open the run, read the red job's log and fix it in a PR (never with a direct push to the default branch).",
  };
}

function checkTemplateVersion(ctx: Context, ghReady: boolean): Check {
  const answers = ctx.read(".copier-answers.yml");
  if (!answers) return { id: "template", title: "Template version", status: "skip", detail: "No `.copier-answers.yml`: this project was not created with Copier." };
  const a = parseAnswers(answers);
  const current = a._commit ?? "";
  const from = shown(current, COMMIT_RE, "an unrecognized version");
  const source = parseTemplateSource(a._src_path ?? "");
  if (!source) return { id: "template", title: "Template version", status: "skip", detail: `Created from ${from} of a template that is not on GitHub.` };
  if (!ghReady) return { id: "template", title: "Template version", status: "skip", detail: `Created from ${from} of \`${source}\`; needs \`gh\` to look for updates.` };
  const latest = ghApi<{ tag_name: string }>(ctx, `repos/${source}/releases/latest`);
  if (!latest.ok) return { id: "template", title: "Template version", status: "skip", detail: `Created from ${from} of \`${source}\`; could not read its latest release (${latest.error}).` };
  const have = parseVersion(current);
  const want = typeof latest.data.tag_name === "string" ? parseVersion(latest.data.tag_name) : null;
  if (!want) return { id: "template", title: "Template version", status: "skip", detail: `Created from ${from} of \`${source}\`; its latest release is not a version tag.` };
  const tag = `v${want.join(".")}`;
  const update = `On a clean working tree: \`copier update --defaults\`, read the template's CHANGELOG for entries marked **Action needed**, review the diff and open a PR.`;
  if (!have) {
    return { id: "template", title: "Template version", status: "warn", detail: `Created from ${from}, which is not a release of \`${source}\`; the latest release is \`${tag}\`.`, fix: update };
  }
  if (compareVersions(have, want) < 0) {
    return { id: "template", title: "Template version", status: "warn", detail: `${from} of \`${source}\`; update available: \`${tag}\`.`, fix: update };
  }
  return { id: "template", title: "Template version", status: "pass", detail: `${from} of \`${source}\`, the latest release.` };
}

// ---------- projects that adopted the workflow (/adt:adopt), in observe mode ----------

export interface Adopted {
  template: { repository?: string; release?: string };
  mode: string;
  observeChecks: string[];
  requiredChecks: string[];
  labels: Record<string, string>;
}

const LABEL_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._:-]{0,49}$/u;
/** Workflow file of each observe check, as /adt:adopt writes them. */
const OBSERVE_WORKFLOWS: Record<string, string> = { "adt-review": "adt-review.yml", "adt-invariants": "adt-invariants.yml", "adt-evals": "adt-evals.yml" };
/** Consecutive green runs before an observe check is worth making required (the owner decides). */
export const STABLE_RUNS = 5;

/** `.github/adt.json`, when the project adopted the workflow; values that do not match closed patterns are dropped. */
export function adoptedConfig(ctx: Context): Adopted | null {
  const file = readJson<Partial<Adopted>>(ctx, ".github/adt.json");
  if (file.state !== "ok" || file.data.mode !== "observe") return null;
  const d = file.data;
  return {
    template: d.template ?? {},
    mode: "observe",
    observeChecks: (d.observeChecks ?? []).filter((c) => typeof c === "string" && Object.hasOwn(OBSERVE_WORKFLOWS, c)),
    requiredChecks: (d.requiredChecks ?? []).filter((c) => typeof c === "string" && CHECK_NAME_RE.test(c)),
    labels: Object.fromEntries(Object.entries(d.labels ?? {}).filter(([, n]) => typeof n === "string" && LABEL_NAME_RE.test(n))),
  };
}

function checkAdoptedLabels(ctx: Context, repo: RepoInfo, adopted: Adopted): Check {
  const r = ctx.run("gh", ["api", "--paginate", `repos/${repo.slug}/labels?per_page=100`, "--jq", ".[].name"]);
  if (r.code !== 0) return { id: "labels", title: "Labels", status: "skip", detail: "Could not list the labels." };
  const have = new Set(r.stdout.split("\n").map((l) => l.trim()));
  const names = Object.values(adopted.labels);
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return { id: "labels", title: "Labels", status: "pass", detail: `The ${names.length} mapped labels exist (\`.github/adt.json\`).` };
  return {
    id: "labels",
    title: "Labels",
    status: "warn",
    detail: `Mapped in \`.github/adt.json\` but missing on GitHub: ${missing.map((n) => `\`${n}\``).join(", ")}. The observe checks still run; the labels are only needed to approve or to review again.`,
    fix: missing.map((n) => `\`gh label create "${n}" -R ${repo.slug}\``).join("\n"),
  };
}

/** The project's own required checks stay required, from rulesets or classic branch protection; the observe checks are not. */
function checkAdoptedProtection(ctx: Context, repo: RepoInfo, adopted: Adopted): Check {
  const title = `Protection of ${repo.branchLabel}`;
  const rules = ghApi<Array<{ type: string; parameters?: { required_status_checks?: Array<{ context: string }> } }>>(ctx, `repos/${repo.slug}/rules/branches/${encodeURIComponent(repo.defaultBranch)}`);
  const classic = ghApi<{ contexts?: string[]; checks?: Array<{ context: string }> }>(
    ctx,
    `repos/${repo.slug}/branches/${encodeURIComponent(repo.defaultBranch)}/protection/required_status_checks`,
  );
  if (!rules.ok && !classic.ok) return { id: "ruleset", title, status: "skip", detail: `Could not read the protection (${rules.error}).` };
  const required = new Set([
    ...(rules.ok ? rules.data.filter((r) => r.type === "required_status_checks").flatMap((r) => r.parameters?.required_status_checks ?? []).map((c) => c.context) : []),
    ...(classic.ok ? [...(classic.data.contexts ?? []), ...(classic.data.checks ?? []).map((c) => c.context)] : []),
  ]);
  const missing = adopted.requiredChecks.filter((c) => !required.has(c));
  const promoted = adopted.observeChecks.filter((c) => required.has(c));
  const list = (names: string[]) => names.map((c) => `\`${c}\``).join(", ");
  if (missing.length) {
    return {
      id: "ruleset",
      title,
      status: "fail",
      detail: `Not required any more: ${list(missing)} (listed as required in \`.github/adt.json\`).`,
      fix: "Make them required again in **Settings → Branches** (or **Rules**), or update `requiredChecks` in `.github/adt.json` in a PR if that was your decision.",
    };
  }
  const note = promoted.length ? ` Made required by the owner: ${list(promoted)}.` : " The adopted checks are in observe mode (not required).";
  return { id: "ruleset", title, status: "pass", detail: `Required: ${adopted.requiredChecks.length ? list(adopted.requiredChecks) : "none yet"}.${note}` };
}

/** How each observe check has done on recent PRs: green often enough to become required, or not yet. Never decides it. */
function checkObserve(ctx: Context, repo: RepoInfo, adopted: Adopted): Check[] {
  return adopted.observeChecks.map((name): Check => {
    const title = `Observe: \`${name}\``;
    const runs = ghApi<{ workflow_runs: Array<{ status: string; conclusion: string | null }> }>(
      ctx,
      `repos/${repo.slug}/actions/workflows/${OBSERVE_WORKFLOWS[name]}/runs?event=pull_request&per_page=20`,
    );
    if (!runs.ok) return { id: `observe-${name}`, title, status: "skip", detail: runs.status === 404 ? "Its workflow is not on GitHub yet (it arrives with the adoption PR)." : `Could not read its runs (${runs.error}).` };
    const done = runs.data.workflow_runs.filter((r) => r.status === "completed" && r.conclusion !== "skipped" && r.conclusion !== "cancelled");
    if (!done.length) return { id: `observe-${name}`, title, status: "warn", detail: "It has not run on a PR yet.", fix: "It runs on the next ready PR (the evals only when the PR touches AI code)." };
    const streak = done.findIndex((r) => r.conclusion !== "success");
    const greenInARow = streak === -1 ? done.length : streak;
    const green = done.filter((r) => r.conclusion === "success").length;
    if (greenInARow >= STABLE_RUNS) {
      return {
        id: `observe-${name}`,
        title,
        status: "pass",
        detail: `Green in the last ${greenInARow} PR runs (${green} of ${done.length} overall): it can become a required check, if you decide so.`,
      };
    }
    return {
      id: `observe-${name}`,
      title,
      status: "warn",
      detail: `${green} of the last ${done.length} PR runs green; ${greenInARow} in a row (${STABLE_RUNS} needed before suggesting it as required).`,
      fix: "Keep observing: read the red runs, fix what is real, and leave it not required until it is consistently green.",
    };
  });
}

function checkAdoptedVersion(ctx: Context, adopted: Adopted): Check {
  const release = adopted.template.release ?? "";
  const from = shown(release.replace(/\+unreleased$/, ""), COMMIT_RE, "an unrecognized version");
  const source = typeof adopted.template.repository === "string" && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(adopted.template.repository) ? adopted.template.repository : null;
  if (!source) return { id: "template", title: "Template version", status: "skip", detail: "Adopted from a template that is not on GitHub." };
  const latest = ghApi<{ tag_name: string }>(ctx, `repos/${source}/releases/latest`);
  const have = parseVersion(release.replace(/\+unreleased$/, ""));
  const want = latest.ok && typeof latest.data.tag_name === "string" ? parseVersion(latest.data.tag_name) : null;
  if (!want || !have) return { id: "template", title: "Template version", status: "skip", detail: `Adopted from ${from} of \`${source}\`.` };
  if (compareVersions(have, want) < 0 || release.endsWith("+unreleased")) {
    return { id: "template", title: "Template version", status: "warn", detail: `Adopted from ${from} of \`${source}\`; the latest release is \`v${want.join(".")}\`.`, fix: "Run `/adt:adopt` again from the latest release: it adds only what is missing and lists what differs." };
  }
  return { id: "template", title: "Template version", status: "pass", detail: `Adopted from ${from} of \`${source}\`, the latest release.` };
}

export function checkSetup(ctx: Context): Check[] {
  const gh = checkGh(ctx);
  const results: Check[] = [...gh.checks];
  const ghReady = gh.checks.every((c) => c.status === "pass");
  if (!ghReady) {
    results.push({ id: "repo", title: "GitHub checks", status: "skip", detail: "Skipped: they need the GitHub CLI logged in." });
    results.push(checkTemplateVersion(ctx, false));
    return results;
  }
  const { repo, check } = checkRepo(ctx);
  results.push(check);
  const adopted = adoptedConfig(ctx);
  if (adopted) {
    if (repo) {
      results.push(checkAdoptedLabels(ctx, repo, adopted), checkAdoptedProtection(ctx, repo, adopted), ...checkObserve(ctx, repo, adopted));
      results.push(...checkSecretsAndConfig(ctx, repo).filter((c) => c.id !== "evals-config"));
    }
    results.push(checkAdoptedVersion(ctx, adopted));
    return results;
  }
  if (repo) results.push(checkLabels(ctx, repo), checkDependencyGraph(ctx, repo), checkRuleset(ctx, repo, gh.login), ...checkSecretsAndConfig(ctx, repo), checkCi(ctx, repo));
  results.push(checkTemplateVersion(ctx, true));
  return results;
}

const ICON: Record<Status, string> = { pass: "✅", warn: "⚠️", fail: "❌", skip: "⏭️" };

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderReport(results: Check[]): string {
  const counts = (s: Status) => results.filter((r) => r.status === s).length;
  const lines = [
    `## Setup check: ${counts("fail") ? `❌ ${counts("fail")} to fix` : counts("warn") ? `⚠️ ${counts("warn")} warning(s)` : "✅ all good"}`,
    "",
    "| | Check | Result |",
    "|---|---|---|",
    ...results.map((r) => `| ${ICON[r.status]} | ${cell(r.title)} | ${cell(r.detail)} |`),
  ];
  const toFix = results.filter((r) => r.fix && (r.status === "fail" || r.status === "warn"));
  if (toFix.length) {
    lines.push("", "### How to fix", "");
    for (const r of toFix) lines.push(`**${ICON[r.status]} ${r.title}**`, "", r.fix ?? "", "");
  }
  return lines.join("\n").trimEnd();
}
