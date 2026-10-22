// What a project created from ai-dev-template is expected to have, and parsers for the files that say so.
// Shared by /adt:check-setup and /adt:new-project. Tested in tests/unit/plugin-check-setup.test.ts.

/** Labels the bots use. Same list as the README's `gh label create` commands (a test keeps them equal). */
export const LABELS = [
  { name: "re-review", color: "1D76DB", description: "Review again, only what changed since the last review" },
  { name: "deep-review", color: "5319E7", description: "Full review with the strongest model (owner only)" },
  { name: "invariant-approved", color: "B60205", description: "Owner approves a change to the non-negotiable tests" },
  { name: "eval-approved", color: "D93F0B", description: "Owner approves deleting or changing golden set cases" },
  { name: "direction-check", color: "0E8A16", description: "Weekly direction check issue" },
];

/** Required checks when the project has no `.github/rulesets/protect-main.json` to read them from. */
export const DEFAULT_REQUIRED_CHECKS = ["quality", "invariants", "dependencies", "review", "evals", "e2e"];
/** GitHub Actions: required checks must come from it, so nobody can post a fake green through the API. */
export const ACTIONS_APP_ID = 15368;

/** `owner/repo` of a GitHub remote URL (https or ssh), or null. Only GitHub.com URLs; never `.` or `..` as the name. */
export function parseGitHubRemote(url: string): string | null {
  const m = /^(?:https:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m || m[2] === "." || m[2] === "..") return null;
  return `${m[1]}/${m[2]}`;
}

/** GitHub secret names: letters, digits and `_`, not starting with a digit. Anything else never goes into a command. */
export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `owner/repo` of a Copier template source (`gh:owner/repo`, a GitHub URL), or null (e.g. a local path). */
export function parseTemplateSource(src: string): string | null {
  const gh = /^gh:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(src.trim());
  return gh ? `${gh[1]}/${gh[2]}` : parseGitHubRemote(src);
}

/** Top-level `key: value` pairs of `.copier-answers.yml` (enough for `_commit` and `_src_path`). */
export function parseAnswers(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** `vX.Y.Z` → [X, Y, Z]; null if it is not a release tag (e.g. a commit hash). */
export function parseVersion(tag: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Required check names in a ruleset JSON (`protect-main.json`), or null if it has none. */
export function requiredChecksOf(ruleset: unknown): string[] | null {
  const rules = (ruleset as { rules?: Array<{ type?: string; parameters?: { required_status_checks?: Array<{ context?: string }> } }> })?.rules;
  const rule = rules?.find((r) => r.type === "required_status_checks");
  const contexts = rule?.parameters?.required_status_checks?.map((c) => c.context ?? "").filter(Boolean);
  return contexts?.length ? contexts : null;
}
