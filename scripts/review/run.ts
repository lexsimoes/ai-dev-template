// Automated PR reviewer, provider-independent.
//
// Modes:
//   --mode ci      on GitHub Actions: picks the kind of review from the event, comments, and fails on a blocking finding
//   --mode local   on your machine: full review of the current branch against origin/main, printed in the terminal
//   --mode canary  measures the reviewer against a fake PR with planted defects (scripts/review/canary/)
// Options: --dry-run (shows what would be sent, without calling the model) · --base <ref> · --tier <tier>
//
// In CI, the kind of review depends on the event and on the PR as it is now (live labels, state in the comment):
//   PR marked ready / opened ready / reopened → full (or incremental, if a review already happened)
//   label "re-review" on the PR (any event)   → incremental since the last reviewed commit
//   label "deep-review"                       → full, with the strongest model
//   approval label added or removed           → full, if findings are open (they may depend on the label)
//   commit already reviewed                   → no model call: only recomputes the verdict
//   push after the review                     → no model call: keeps the previous verdict,
//                                               but fails if the new commits have a secret,
//                                               a sensitive path, or if a blocking finding is pending
//
// Criteria (REVIEW.md), rules (AGENTS.md) and configuration (.github/review.json) are read from the folder
// where this script lives. In CI that is the target branch: a PR cannot loosen its own review.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  REPORT_MARKER,
  approvalsOn,
  buildPrompt,
  composeComment,
  decideKind,
  decodeState,
  deletedFiles,
  extractReport,
  filterFiles,
  isDispensed,
  openFindings,
  parseRenames,
  parseReview,
  pushReasons,
  redactSecrets,
  renderReport,
  resolvePrevious,
  retargetRenamed,
  secretFinding,
  secretPathFindings,
  selectTier,
  splitDiff,
} from "./lib.ts";
import type {
  Finding,
  ParsedReview,
  PreviousFinding,
  ReportInput,
  ReviewConfig,
  ReviewKind,
  ReviewState,
  Severity,
  TierName,
  Usage,
} from "./lib.ts";
import { ModelCallError, callModel } from "./providers.ts";

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// GitHub Actions sets GITHUB_API_URL (it also points to GitHub Enterprise).
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const CANARY_DIR = join(SOURCE_DIR, "scripts", "review", "canary");

interface CanaryDefect {
  id: string;
  description: string;
  file: string;
  lines: [number, number] | null;
  minSeverity: Severity;
}

interface ExistingComment {
  id: number;
  body: string;
}

function readSource(path: string): string {
  return readFileSync(join(SOURCE_DIR, path), "utf-8");
}

function loadConfig(): ReviewConfig {
  const config = JSON.parse(readSource(".github/review.json")) as ReviewConfig;
  // The repository variables switch the provider of the standard tier and of light (standard with less reasoning).
  for (const name of ["standard", "light"] as const) {
    if (process.env.REVIEW_API_BASE_URL) config.tiers[name].baseUrl = process.env.REVIEW_API_BASE_URL;
    if (process.env.REVIEW_MODEL) config.tiers[name].model = process.env.REVIEW_MODEL;
  }
  return config;
}

// core.quotePath=false: names with accents come out as they are (no quotes or octal codes).
function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Is the reviewed commit still in the PR history? "Not an ancestor" (exit 1) and "commit does not exist"
 * (a force-push removed it) give false; any other git error is a real error, not "force-push".
 */
function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: ["ignore", "ignore", "pipe"] });
    return true;
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer | string };
    const stderr = String(err.stderr ?? "");
    if (err.status === 1 || /not a valid commit|bad object|unknown revision/i.test(stderr)) return false;
    throw new Error(`git merge-base failed (${err.status ?? "?"}): ${stderr.trim().slice(0, 300)}`, { cause: e });
  }
}

// ---------- GitHub ----------

function githubEnv() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) throw new Error("missing GITHUB_TOKEN, GITHUB_REPOSITORY or PR_NUMBER");
  return { repo, pr, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } };
}

async function findComment(): Promise<ExistingComment | null> {
  const { repo, pr, headers } = githubEnv();
  // Paginates: on PRs with many comments, the reviewer's may not be on the first page.
  for (let page = 1; page <= 20; page++) {
    const list = await fetch(`${API}/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`, { headers });
    if (!list.ok) throw new Error(`could not list comments (HTTP ${list.status})`);
    const comments = (await list.json()) as Array<{ id: number; body?: string; user?: { login?: string } }>;
    // Only the comment from the GitHub Actions bot itself counts.
    const mine = comments.find((c) => c.user?.login === "github-actions[bot]" && c.body?.includes(REPORT_MARKER));
    if (mine) return { id: mine.id, body: mine.body ?? "" };
    if (comments.length < 100) return null;
  }
  return null;
}

async function upsertComment(existing: ExistingComment | null, body: string): Promise<void> {
  const { repo, pr, headers } = githubEnv();
  const url = existing
    ? `${API}/repos/${repo}/issues/comments/${existing.id}`
    : `${API}/repos/${repo}/issues/${pr}/comments`;
  const response = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`could not post the comment (HTTP ${response.status})`);
}

/** PR labels now. The event payload is a snapshot from when the event happened and can miss a label applied since. */
async function liveLabels(): Promise<string[]> {
  const { repo, pr, headers } = githubEnv();
  const response = await fetch(`${API}/repos/${repo}/issues/${pr}/labels?per_page=100`, { headers });
  if (!response.ok) throw new Error(`could not read the PR labels (HTTP ${response.status})`);
  return ((await response.json()) as Array<{ name: string }>).map((l) => l.name);
}

/** Removes the "re-review" label after using it, so it can be applied again. */
async function removeLabel(label: string): Promise<void> {
  const { repo, pr, headers } = githubEnv();
  const response = await fetch(`${API}/repos/${repo}/issues/${pr}/labels/${encodeURIComponent(label)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 404) console.warn(`Warning: could not remove the label ${label} (HTTP ${response.status}).`);
}

// ---------- canary ----------

/** Incremental canary: the finding NOT fixed must not become "resolved"; the fixed one must. */
function evaluateIncrementalCanary(resolved: Array<{ id: number; status: string; title: string; comment: string }>): {
  text: string;
  passed: boolean;
} {
  const expected = JSON.parse(readFileSync(join(CANARY_DIR, "incremental", "expected.json"), "utf-8")) as {
    resolved: number[];
    pending: number[];
  };
  const rows = resolved.map((r) => {
    const want = expected.resolved.includes(r.id) ? "resolved" : expected.pending.includes(r.id) ? "pending" : "?";
    return { r, want, ok: r.status === want };
  });
  const passed = rows.every((x) => x.ok) && rows.length === expected.resolved.length + expected.pending.length;
  const lines = [
    `## 🐤 Incremental canary: ${rows.filter((x) => x.ok).length} of ${rows.length} verdicts correct`,
    "",
    "| Previous finding | Expected | Model verdict |",
    "|---|---|---|",
    ...rows.map(({ r, want, ok }) => `| ${r.id}. ${r.title} | ${want} | ${ok ? "✅" : "❌"} ${r.status}: ${r.comment} |`),
  ];
  return { text: lines.join("\n"), passed };
}

function evaluateCanary(findings: Finding[]): { text: string; passed: boolean } {
  const expected = JSON.parse(readFileSync(join(CANARY_DIR, "expected.json"), "utf-8")) as CanaryDefect[];
  const rank: Record<Severity, number> = { blocking: 0, important: 1, suggestion: 2 };
  const rows = expected.map((d) => {
    const hit = findings.find(
      (f) =>
        f.file === d.file &&
        rank[f.severity] <= rank[d.minSeverity] &&
        (d.lines === null || f.line === null || (f.line >= d.lines[0] - 3 && f.line <= d.lines[1] + 3)),
    );
    return { d, hit };
  });
  const found = rows.filter((r) => r.hit).length;
  const lines = [
    `## 🐤 Review canary: ${found} of ${expected.length} planted defects found`,
    "",
    "| Planted defect | Expected | Result |",
    "|---|---|---|",
    ...rows.map(
      ({ d, hit }) =>
        `| ${d.description} (\`${d.file}\`) | ${d.minSeverity} or worse | ${hit ? `✅ ${hit.severity}: ${hit.title}` : "❌ not found"} |`,
    ),
  ];
  return { text: lines.join("\n"), passed: found === expected.length };
}

// ---------- run ----------

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "local" },
      "dry-run": { type: "boolean", default: false },
      base: { type: "string" },
      tier: { type: "string" },
      canary: { type: "string", default: "full" },
    },
  });
  const mode = values.mode ?? "local";
  if (!["ci", "local", "canary"].includes(mode)) throw new Error(`unknown mode: ${mode}`);

  const started = Date.now();
  const config = loadConfig();
  const notes: string[] = [];

  // PR context
  const baseRef = mode === "ci" ? `origin/${process.env.BASE_REF || "main"}` : (values.base ?? "origin/main");
  const headSha = mode === "ci" ? (process.env.HEAD_SHA || git("rev-parse", "HEAD").trim()) : "HEAD";
  let labels = mode === "ci" && !values["dry-run"] ? await liveLabels() : ((JSON.parse(process.env.PR_LABELS || "[]") as string[] | null) ?? []);
  let title = process.env.PR_TITLE ?? "";
  let body = process.env.PR_BODY ?? "";
  if (mode === "local") title = git("log", "-1", "--format=%s").trim();

  const canaryCase = values.canary ?? "full";
  if (mode === "canary" && !["full", "light", "incremental"].includes(canaryCase)) throw new Error(`unknown canary case: ${canaryCase}`);
  const incrementalCanary = mode === "canary" && canaryCase === "incremental";

  const existing = mode === "ci" && !values["dry-run"] ? await findComment() : null;
  // Incremental canary: fake state with the case's "previous" findings.
  const state: ReviewState | null = incrementalCanary
    ? { sha: "0".repeat(40), findings: JSON.parse(readFileSync(join(CANARY_DIR, "incremental", "previous.json"), "utf-8")) as Finding[] }
    : existing
      ? decodeState(existing.body)
      : null;
  if (existing && !state && existing.body.includes("review-state")) notes.push("The state stored in the comment was invalid and was ignored.");
  const stateReachable = mode === "ci" && state !== null && isAncestor(state.sha, headSha);
  const event = { action: process.env.EVENT_ACTION ?? "", label: process.env.EVENT_LABEL ?? "", labels, head: headSha };
  const decision =
    mode === "ci"
      ? decideKind(event, config, state, stateReachable)
      : { kind: (incrementalCanary ? "incremental" : "full") as ReviewKind, note: null };
  const kind = decision.kind;
  if (decision.note) notes.push(decision.note);

  // Diff to analyze: the whole PR, or only what changed since the last review.
  // The secret detectors always look at the whole PR: a secret only goes away when it leaves the PR.
  let diff: string;
  let fullDiff: string;
  let prPaths: string[];
  if (mode === "canary") {
    const pr = JSON.parse(readFileSync(join(CANARY_DIR, "pr.json"), "utf-8")) as { title: string; body: string; labels?: string[] };
    title = pr.title;
    body = pr.body;
    labels = pr.labels ?? [];
    // The fake secret is generated on the spot: no key-like value is stored in the repository.
    const fake = ["canary", "not", "a", "real", Date.now().toString(36), "x".repeat(12)].join("-");
    diff = incrementalCanary
      ? readFileSync(join(CANARY_DIR, "incremental", "incremental.diff"), "utf-8")
      : readFileSync(join(CANARY_DIR, "canary.diff"), "utf-8").replaceAll("{{FAKE_SECRET}}", fake);
    fullDiff = diff;
    prPaths = splitDiff(diff).map((f) => f.path);
  } else {
    prPaths = git("diff", "--name-only", "-z", `${baseRef}...${headSha}`).split("\0").filter(Boolean);
    fullDiff = git("diff", "--no-color", "-U5", `${baseRef}...${headSha}`);
    const incrementalBase = (kind === "incremental" || kind === "no-review") && state && stateReachable ? state.sha : null;
    diff = incrementalBase ? git("diff", "--no-color", "-U5", incrementalBase, headSha) : fullDiff;
  }

  // Only PR files: merging main into the branch does not inflate the incremental diff.
  const prPathSet = new Set(prPaths);
  const allFiles = splitDiff(diff).filter((f) => prPathSet.has(f.path) || mode === "canary");
  const filtered = filterFiles(allFiles, config);
  const redacted = filtered.included.map(redactSecrets);
  const included = redacted.map((r) => r.file);
  const fullFiles = splitDiff(fullDiff);
  const fullFiltered = filterFiles(fullFiles, config);
  const fullHits = fullFiltered.included.flatMap((f) => redactSecrets(f).hits);
  const secretFindings = [
    ...secretPathFindings(fullFiles, fullFiltered.excluded),
    ...fullHits.filter((h) => h.added).map((h) => secretFinding(h.path, h.line)),
  ];
  const contextHits = redacted.flatMap((r) => r.hits).filter((h) => !h.added).length;
  if (contextHits > 0) notes.push(`${contextHits} possible secret(s) in existing lines were redacted before sending.`);

  // ----- push after the review: no model call -----
  if (kind === "no-review") {
    const changed = allFiles.map((f) => f.path);
    const reasons = pushReasons({ state, stateReachable, secretFindings, changedPaths: changed, config });
    const since = state ? ` since \`${state.sha.slice(0, 7)}\`` : "";
    const banner = [
      `> ⏩ **New commits${since} were not reviewed by the model** (push after the review: \`${headSha.slice(0, 7)}\`).`,
      changed.length ? `> Changed files: ${changed.map((p) => `\`${p}\``).join(", ")}` : "",
      reasons.length
        ? `> ❌ Red check: ${reasons.join("; ")}. Fix it if needed and apply the \`${config.rereviewLabel}\` label for a new review.`
        : `> ✅ Green check: previous verdict kept. **Green does not cover these commits**: to review them, apply the \`${config.rereviewLabel}\` label.`,
    ]
      .filter(Boolean)
      .join("\n");
    // Nothing changed since the review (e.g. an unrelated label): the verdict is recomputed and the comment stays as it is.
    if (state && changed.length === 0) {
      const verdict = [...notes, reasons.length ? `❌ Red check: ${reasons.join("; ")}.` : "✅ Verdict from the last review kept."].join("\n");
      console.log(verdict);
      // "re-review" on a commit that is already reviewed (e.g. the other run of a push + label pair got there first).
      if (mode === "ci" && !values["dry-run"] && labels.includes(config.rereviewLabel)) await removeLabel(config.rereviewLabel);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, verdict + "\n");
      return reasons.length ? 1 : 0;
    }
    const comment = composeComment(banner, existing ? extractReport(existing.body) : "", state);
    console.log(comment);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, banner + "\n");
    if (mode === "ci" && !values["dry-run"]) await upsertComment(existing, comment);
    return reasons.length ? 1 : 0;
  }

  // ----- tier -----
  const selected = values.tier
    ? { tier: values.tier as TierName, reason: "tier chosen by --tier" }
    : mode === "canary"
      ? canaryCase === "light"
        ? { tier: "light" as TierName, reason: "light tier canary" }
        : { tier: "standard" as TierName, reason: `canary (${canaryCase}) measures the standard tier` }
      : selectTier(prPaths, labels, config);
  let tierName = selected.tier;
  let tier = config.tiers[tierName];
  if (!tier) throw new Error(`unknown tier: ${tierName}`);
  if ((tierName === "sensitive" || tierName === "deep") && !process.env[tier.apiKeyEnv]) {
    notes.push(
      `Escalation to \`${tier.model}\` (${selected.reason}) **not run**: the secret \`${tier.apiKeyEnv}\` is not configured. Reviewed by the standard tier.`,
    );
    tierName = "standard";
    tier = config.tiers.standard;
  }
  const dispensed = mode === "ci" && isDispensed(kind, tierName, config);
  const finalKind: ReviewKind = dispensed ? "waived" : kind;

  // ----- previous findings (incremental review) -----
  // Detector findings are left out: the detector runs again on the whole PR and reports them while they exist.
  // File renamed since the last review: the finding moves to the new path (renaming does not close a finding).
  const renames =
    finalKind === "incremental" && state && mode !== "canary"
      ? parseRenames(git("diff", "--name-status", "-z", "-M", state.sha, headSha))
      : {};
  const previous: PreviousFinding[] =
    finalKind === "incremental"
      ? retargetRenamed((state?.findings ?? []).filter((a) => a.origin !== "detector"), renames).map((a, i) => ({ ...a, id: i + 1 }))
      : [];
  const changedNow = new Set(included.map((f) => f.path));
  const toCheck = previous.filter((p) => p.file === "PR" || changedNow.has(p.file));

  const diffText = included.map((f) => f.text).join("\n");
  const prompt = buildPrompt({
    reviewMd: readSource("REVIEW.md"),
    agentsMd: readSource("AGENTS.md"),
    title,
    body,
    labels,
    diff: diffText,
    files: included.map((f) => f.path),
    withheld: [...filtered.excluded, ...filtered.ignored],
    maxFindings: config.maxFindings,
    ...(finalKind === "incremental" && state ? { incremental: { sinceSha: state.sha, previous: toCheck } } : {}),
  });

  if (values["dry-run"]) {
    console.log(
      [
        `Mode: ${mode} (dry-run, no model call) · kind: ${finalKind}`,
        `Tier: ${tierName} (${selected.reason}) · model: ${tier.model}`,
        ...notes.map((n) => `Note: ${n}`),
        `Files sent (${included.length}): ${included.map((f) => f.path).join(", ") || "none"}`,
        `Never sent (secret): ${filtered.excluded.join(", ") || "none"}`,
        `Ignored (configuration): ${filtered.ignored.join(", ") || "none"}`,
        `Possible secrets in added lines: ${secretFindings.length}`,
        `Diff size: ${diffText.length} of ${config.maxDiffChars} characters allowed`,
        `Prompt: ${prompt.system.length} system characters (fixed, cache-friendly) + ${prompt.user.length} from the PR`,
      ].join("\n"),
    );
    return 0;
  }

  // ----- model call -----
  let review: ParsedReview | null = null;
  let usage: Usage | null = null;
  let error: string | null = null;
  const apiKey = process.env[tier.apiKeyEnv];
  const needsModel = finalKind !== "waived" && (included.length > 0 || toCheck.length > 0);
  if (finalKind === "waived") {
    notes.push('Trivial PR with `trivial.mode = "none"`: only the secret detectors ran.');
  } else if (!needsModel) {
    notes.push("No reviewable file in the diff.");
  } else if (diffText.length > config.maxDiffChars) {
    error = `the diff has ${diffText.length} characters, above the limit of ${config.maxDiffChars}. Split the PR into smaller parts.`;
  } else if (!apiKey) {
    error = `the secret \`${tier.apiKeyEnv}\` is not available in this environment.`;
  } else {
    try {
      const reply = await callModel(tier, apiKey, prompt, config.timeoutMs);
      usage = reply.usage;
      review = parseReview(reply.text, included.map((f) => f.path), config.maxFindings);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof ModelCallError) usage = e.usage;
    }
  }

  const checkedIds = new Set(toCheck.map((p) => p.id));
  const resolved = resolvePrevious(previous, (review?.previous ?? []).filter((s) => checkedIds.has(s.id)), {
    deletedPaths: deletedFiles(splitDiff(diff)),
    prPaths: mode === "canary" ? undefined : prPaths,
    changedPaths: [...changedNow],
  });
  const report: ReportInput = {
    kind: finalKind,
    reviewedSha: mode === "ci" ? headSha : null,
    sinceSha: finalKind === "incremental" ? (state?.sha ?? null) : null,
    tierName,
    tier: needsModel ? tier : null,
    reason: selected.reason,
    notes,
    review,
    previous: resolved,
    secretFindings,
    excluded: filtered.excluded,
    ignored: filtered.ignored,
    usage,
    durationMs: Date.now() - started,
    error,
  };
  let markdown = renderReport(report);
  const open = openFindings(report);
  const blocking = open.filter((f) => f.severity === "blocking").length;

  let exitCode = error || blocking > 0 ? 1 : 0;
  if (incrementalCanary) {
    const canary = evaluateIncrementalCanary(resolved);
    markdown = `${canary.text}\n\n${markdown}`;
    exitCode = error || !canary.passed ? 1 : 0;
  } else if (mode === "canary") {
    const canary = evaluateCanary([...secretFindings, ...(review?.findings ?? [])]);
    markdown = `${canary.text}\n\n${markdown}`;
    exitCode = error || !canary.passed ? 1 : 0;
  }

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  if (mode === "ci") {
    // Only advance the state when the review finished. On error, the previous state still holds,
    // but marked with the failure: the next push does not turn green until a review finishes well.
    const newState: ReviewState | null = error
      ? state
        ? { ...state, failure: headSha }
        : null
      : { sha: headSha, findings: open, approvals: approvalsOn(labels, config) };
    const banner = `> New pushes do not trigger another review. To review again (only what changed), apply the \`${config.rereviewLabel}\` label.`;
    await upsertComment(existing, composeComment(banner, markdown, newState));
    if (labels.includes(config.rereviewLabel)) await removeLabel(config.rereviewLabel);
  }
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`Reviewer: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
