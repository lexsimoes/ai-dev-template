// Invariant guard, run by the "invariants" CI job.
// Fails when:
//   1. a test in tests/invariants/ is skipped or isolated (.skip, .todo, .only, { skip: ... });
//   2. the PR changes tests/invariants/ without the "invariant-approved" label (applied by the owner);
//   3. the number of invariant tests goes down without that label;
//   4. in CI, the label was applied by someone who is not an owner of tests/invariants/ in the CODEOWNERS
//      of the target branch (e.g. an agent with its own identity or the Actions bot).
//
// CI runs the version of this file that is on the target branch: a PR cannot loosen its own guard.
//
// Environment variables (set by the workflow):
//   EVENT_NAME  "pull_request" or "push" (empty = local use, compares with main)
//   BASE_REF    target branch of the PR (e.g. "main")
//   PR_LABELS   JSON with the names of the PR labels
//   PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN  to check who applied or removed the label
//   INVARIANT_LABEL  name of the approval label, when a project adopted the workflow with its own label names
//                    (default "invariant-approved")
//   INVARIANTS_DIR   folder of the non-negotiable tests, when a project keeps them elsewhere (default "tests/invariants")
//
// Local use: npm run guard:invariants  (after git fetch origin main)

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]{1,100}$/.test(process.env.INVARIANTS_DIR ?? "")
  ? (process.env.INVARIANTS_DIR as string).replace(/\/+$/, "")
  : "tests/invariants";
const APPROVAL_LABEL = /^[\p{L}\p{N} ._:-]{1,50}$/u.test(process.env.INVARIANT_LABEL ?? "")
  ? (process.env.INVARIANT_LABEL as string)
  : "invariant-approved";
const SKIP_PATTERN = /\b(?:test|it|describe|suite|t)\s*\.\s*(?:skip|todo|only)\b|\{\s*(?:skip|todo|only)\s*:/;
const TEST_CALL = /\b(?:test|it)\s*\(/g;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" });
}

function listTestFiles(dir: string): string[] {
  // A project that adopted the workflow may have no non-negotiable tests yet: no folder means none, not a crash.
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

function countTests(source: string): number {
  return source.match(TEST_CALL)?.length ?? 0;
}

export interface IssueEvent {
  event: string;
  label?: { name: string };
  actor?: { login: string } | null;
  created_at: string;
}

/** Owners of a path in CODEOWNERS: the last matching rule wins, as on GitHub. Only understands `*`, folders and exact files. */
export function ownersOf(codeowners: string, path: string): string[] {
  const target = path.replace(/^\//, "");
  let owners: string[] = [];
  for (const raw of codeowners.split("\n")) {
    const [pattern = "", ...rest] = raw.replace(/#.*/, "").trim().split(/\s+/);
    if (!pattern) continue;
    const prefix = pattern.replace(/^\//, "");
    // "/folder" and "/folder/" apply to the whole folder.
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (pattern === "*" || target === prefix || target.startsWith(dir)) {
      // Only people (@login); teams (@org/team) are not checked here.
      owners = rest.filter((o) => o.startsWith("@") && !o.includes("/")).map((o) => o.slice(1).toLowerCase());
    }
  }
  return owners;
}

/** Who applied the label last; null if it was never applied. */
export function lastLabeler(events: IssueEvent[], label: string): string | null {
  const applied = events.filter((e) => e.event === "labeled" && e.label?.name === label);
  if (applied.length === 0) return null;
  return applied.at(-1)?.actor?.login ?? "unknown";
}

/** The label is applied right now, according to the history (the payload of a "Re-run" may be stale). */
export function isLabeled(events: IssueEvent[], label: string): boolean {
  const last = events.filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === label).at(-1);
  return last?.event === "labeled";
}

/** PR events (labels applied and removed, with author). events null = API unavailable or incomplete history. */
async function issueEvents(): Promise<{ events: IssueEvent[] | null; reason: string }> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) return { events: null, reason: "no access to the GitHub API in this environment" };
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const events: IssueEvent[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${api}/repos/${repo}/issues/${pr}/events?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { events: null, reason: `the API responded ${response.status}` };
    const batch = (await response.json()) as IssueEvent[];
    events.push(...batch);
    if (batch.length < 100) return { events, reason: "" };
  }
  // The API returns oldest to newest: cutting off the end would hide the most recent event.
  return { events: null, reason: "the PR has more than 1,000 events and the history was not read in full" };
}

function labelHistory(events: IssueEvent[]): string[] {
  return events
    .filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === APPROVAL_LABEL)
    .map((e) => `Label \`${APPROVAL_LABEL}\` ${e.event === "labeled" ? "applied" : "removed"} by @${e.actor?.login ?? "unknown"} at ${e.created_at}.`);
}

function report(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const notes: string[] = [];

  // 1. Nothing skipped or isolated, with or without approval.
  const headFiles = listTestFiles(DIR);
  let headCount = 0;
  for (const file of headFiles) {
    const source = readFileSync(file, "utf-8");
    headCount += countTests(source);
    source.split("\n").forEach((line, i) => {
      if (SKIP_PATTERN.test(line)) errors.push(`\`${file}:${i + 1}\` skips or isolates a test: \`${line.trim()}\``);
    });
  }

  // 2, 3 and 4. In PRs and local use: compares with the target branch. On a push to main, there is nothing to compare with.
  if (process.env.EVENT_NAME !== "push") {
    const baseRef = `origin/${process.env.BASE_REF || "main"}`;
    const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[] | null;
    let approved = (labels ?? []).includes(APPROVAL_LABEL);

    const changed = git("diff", "--name-only", `${baseRef}...HEAD`, "--", DIR).split("\n").filter(Boolean);
    const baseFiles = git("ls-tree", "-r", "--name-only", baseRef, "--", DIR)
      .split("\n")
      .filter((f) => f.endsWith(".ts"));
    const baseCount = baseFiles.reduce((sum, f) => sum + countTests(git("show", `${baseRef}:${f}`)), 0);

    notes.push(`Invariant tests: ${baseCount} on \`${baseRef}\` → ${headCount} in this PR.`);

    // 4. The label only counts if whoever applied it last is an owner of tests/invariants/ on the target branch.
    if (approved && (changed.length > 0 || headCount < baseCount)) {
      const { events, reason } = await issueEvents();
      if (!events) {
        if (process.env.EVENT_NAME === "pull_request") {
          approved = false;
          errors.push(`Could not check who applied the \`${APPROVAL_LABEL}\` label (${reason}). Run the job again.`);
        } else {
          notes.push(`Who applied the label: not verified (${reason}).`);
        }
      } else if (!isLabeled(events, APPROVAL_LABEL)) {
        approved = false;
        notes.push(...labelHistory(events));
        errors.push(`The \`${APPROVAL_LABEL}\` label is not applied right now (it was removed after this event).`);
      } else {
        notes.push(...labelHistory(events));
        const codeowners = git("ls-tree", "--name-only", baseRef, ".github/CODEOWNERS").trim()
          ? git("show", `${baseRef}:.github/CODEOWNERS`)
          : "";
        const owners = ownersOf(codeowners, `${DIR}/`);
        const labeler = lastLabeler(events, APPROVAL_LABEL);
        if (owners.length === 0) {
          approved = false;
          errors.push(`The CODEOWNERS of \`${baseRef}\` defines no owner for \`${DIR}/\`: nobody can approve.`);
        } else if (!labeler || !owners.includes(labeler.toLowerCase())) {
          approved = false;
          const list = owners.map((o) => `@${o}`).join(", ");
          errors.push(`The \`${APPROVAL_LABEL}\` label was applied by @${labeler ?? "unknown"}, who is not an owner of \`${DIR}/\` (${list}).`);
        }
      }
    }

    if (changed.length > 0) {
      const list = changed.map((f) => `\`${f}\``).join(", ");
      if (approved) notes.push(`Protected files changed with the \`${APPROVAL_LABEL}\` label: ${list}.`);
      else errors.push(`This PR changes protected files without a valid \`${APPROVAL_LABEL}\` label: ${list}.`);
    }
    if (headCount < baseCount && !approved) {
      errors.push(`The number of invariant tests dropped from ${baseCount} to ${headCount}.`);
    }
  } else {
    notes.push(`Invariant tests: ${headCount}.`);
  }

  if (errors.length > 0) {
    report([
      "## ❌ Invariant guard",
      "",
      ...errors.map((e) => `- ${e}`),
      "",
      ...notes.map((n) => `- ${n}`),
      "",
      "Invariants only change by decision of the owner (see `tests/invariants/README.md`).",
      `Agent: stop and ask. Owner: if the change is intentional, apply the \`${APPROVAL_LABEL}\` label to the PR yourself.`,
    ]);
    return 1;
  }

  report(["## ✅ Invariant guard", "", ...notes.map((n) => `- ${n}`), "- No test skipped or isolated."]);
  return 0;
}

// Run directly (CI or npm run): runs the guard. Imported (tests): only exposes the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
