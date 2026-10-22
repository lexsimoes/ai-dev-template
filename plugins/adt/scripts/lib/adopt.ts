// The deterministic parts of /adt:adopt: bring the template's workflow into an existing project, on a branch, in observe
// mode, never overwriting a file. The checks it adds (AI review, invariant guard, evals) run next to the project's own
// CI and are not required; the project's required checks stay as they were, and its label names are mapped, never
// renamed. Tested in tests/unit/plugin-adopt.test.ts.

export interface Kit {
  copy: string[];
  workflows: Record<string, string>;
  /** Files copied as they are from another path of the kit (the reviewer's own package.json and lockfile). */
  files: Record<string, string>;
  reviewConfig: string;
  templateOnlySensitivePaths: string[];
  agentsSection: string;
}

/** Label roles the workflow uses, and the template's own names for them. */
export const LABEL_ROLES = {
  invariantApproved: "invariant-approved",
  evalApproved: "eval-approved",
  rereview: "re-review",
  deep: "deep-review",
} as const;
export type LabelRole = keyof typeof LABEL_ROLES;

export interface AdoptAnswers {
  owner: string;
  labels: Record<LabelRole, string>;
  paths: { prd: string; handoff: string; invariants: string };
  evals: { command: string; paths: string[] };
  requiredChecks: string[];
  /** Extra paths the reviewer treats as sensitive (stronger model), from the audit. */
  sensitive: string[];
}

export interface AdtConfig extends Omit<AdoptAnswers, "owner" | "sensitive"> {
  $comment: string;
  template: { repository: string; release: string };
  mode: "observe";
  observeChecks: string[];
}

export const OBSERVE_CHECKS = ["adt-review", "adt-invariants", "adt-evals"];

const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._:-]{0,49}$/u;
const PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]{1,100}$/;
const GLOB_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._*/[\]-]{1,100}$/;
/** The project's own eval command, without a model: `npm run <script>`, optionally with plain arguments. */
const EVAL_COMMAND_RE = /^npm run [a-z0-9][a-z0-9:_-]{0,40}(?: -- [A-Za-z0-9 ._/=:-]{1,200})?$/;
const CHECK_RE = /^[A-Za-z0-9 ._()/-]{1,100}$/;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const list = (raw: string | undefined) => (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** The owner's answers, checked against closed patterns before they reach a workflow file. */
export function validateAdoptAnswers(raw: Record<string, string | undefined>): { answers: AdoptAnswers } | { errors: string[] } {
  const errors: string[] = [];
  const owner = raw.owner?.trim() ?? "";
  if (!OWNER_RE.test(owner)) errors.push("owner: a GitHub username (it becomes the owner of the invariants folder in CODEOWNERS)");

  const labels = { ...LABEL_ROLES } as Record<LabelRole, string>;
  for (const pair of list(raw.labels)) {
    const [role, name = ""] = pair.split("=").map((s) => s.trim());
    if (!role || !(role in LABEL_ROLES)) errors.push(`labels: unknown role "${(role ?? "").slice(0, 20)}" (roles: ${Object.keys(LABEL_ROLES).join(", ")})`);
    else if (!LABEL_RE.test(name)) errors.push(`labels: "${role}" needs a label name (letters, digits, spaces, . _ : -)`);
    else labels[role as LabelRole] = name;
  }
  if (new Set(Object.values(labels)).size !== Object.keys(labels).length) errors.push("labels: each role needs its own label");

  const paths = { prd: raw.prd?.trim() || "specs/PRD.md", handoff: raw.handoff?.trim() || "docs/HANDOFF.md", invariants: raw.invariants?.trim() || "tests/invariants" };
  for (const [key, value] of Object.entries(paths)) if (!PATH_RE.test(value)) errors.push(`${key}: a relative path inside the project`);

  const command = raw.evalCommand?.trim() ?? "";
  if (!EVAL_COMMAND_RE.test(command)) errors.push("eval-command: the project's own eval script without a model, like `npm run eval -- --mock`");
  const evalPaths = list(raw.evalPaths);
  if (evalPaths.length === 0 || evalPaths.some((p) => !GLOB_RE.test(p))) errors.push("eval-paths: comma-separated globs of the AI code, like `src/lib/ai/**`");

  const requiredChecks = list(raw.required);
  if (requiredChecks.length === 0 || requiredChecks.some((c) => !CHECK_RE.test(c))) errors.push("required: the names of the checks already required on the default branch");
  if (requiredChecks.some((c) => OBSERVE_CHECKS.includes(c))) errors.push("required: the adopted checks start in observe mode; only the owner makes one required, later");

  const sensitive = list(raw.sensitive);
  if (sensitive.some((p) => !GLOB_RE.test(p))) errors.push("sensitive: comma-separated globs");

  if (errors.length) return { errors };
  return { answers: { owner, labels, paths, evals: { command, paths: evalPaths }, requiredChecks, sensitive } };
}

export type PlanAction = { path: string; action: "add" | "identical" | "conflict" };

/**
 * What applying the kit would do to the project: add a file that does not exist, skip one that is already identical,
 * and report one that exists with other content as a conflict. Nothing is overwritten.
 */
export function planFiles(rendered: Record<string, string>, read: (path: string) => string | null): PlanAction[] {
  return Object.entries(rendered)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => {
      const current = read(path);
      return { path, action: current === null ? "add" : current === text ? "identical" : "conflict" };
    });
}

/** Replaces `{{NAME}}` placeholders; every placeholder must have a value, so a missing one is an error, not a blank. */
export function fill(template: string, values: Record<string, string>): string {
  const text = template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, name: string) => values[name] ?? whole);
  const left = /\{\{([A-Z_]+)\}\}/.exec(text);
  if (left) throw new Error(`No value for the placeholder ${left[0]}.`);
  return text;
}

export function placeholderValues(answers: AdoptAnswers, release: string): Record<string, string> {
  return {
    TEMPLATE_RELEASE: release,
    INVARIANT_LABEL: answers.labels.invariantApproved,
    REREVIEW_LABEL: answers.labels.rereview,
    DEEP_LABEL: answers.labels.deep,
    INVARIANTS_DIR: answers.paths.invariants,
    PRD_PATH: answers.paths.prd,
    HANDOFF_PATH: answers.paths.handoff,
    EVAL_COMMAND: answers.evals.command,
    EVAL_PATHS: answers.evals.paths.map((p) => `      - "${p}"`).join("\n"),
    REQUIRED_CHECKS: answers.requiredChecks.map((c) => `\`${c}\``).join(", "),
  };
}

/** The template's reviewer config, for the project: its label names, without the template's own paths, plus its sensitive paths. */
export function adaptReviewConfig(templateJson: string, kit: Kit, answers: AdoptAnswers): string {
  const config = JSON.parse(templateJson) as Record<string, unknown> & { sensitivePaths?: string[] };
  config.deepLabel = answers.labels.deep;
  config.rereviewLabel = answers.labels.rereview;
  config.approvalLabels = [answers.labels.invariantApproved, answers.labels.evalApproved];
  const base = (config.sensitivePaths ?? []).filter((p) => !kit.templateOnlySensitivePaths.includes(p) && p !== "tests/invariants/**");
  config.sensitivePaths = [...new Set([`${answers.paths.invariants}/**`, ...base, ...answers.sensitive])];
  // The implementer never auto-fixes a finding in the project's invariants folder either.
  const autoFix = config.autoFix as { neverPaths?: string[] } | undefined;
  if (autoFix) autoFix.neverPaths = [...new Set([`${answers.paths.invariants}/**`, ...(autoFix.neverPaths ?? [])])];
  // Documents agents read as authority are never "trivial", wherever the project keeps them.
  const trivial = config.trivial as { exceptPaths?: string[] } | undefined;
  if (trivial) trivial.exceptPaths = [...new Set([...(trivial.exceptPaths ?? []), answers.paths.prd, answers.paths.handoff])];
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Markdown copied from the template, with the project's label names, paths and commands. */
export function adaptText(text: string, answers: AdoptAnswers): string {
  const swaps: Array<[string, string]> = [
    // The template's own npm scripts do not exist in the project (its package.json is never changed).
    ["`npm run test:invariants`", "the invariant tests (the project's own check command)"],
    ...Object.entries(LABEL_ROLES).map(([role, name]): [string, string] => [`\`${name}\``, `\`${answers.labels[role as LabelRole]}\``]),
    ["`docs/HANDOFF.md`", `\`${answers.paths.handoff}\``],
    ["`specs/PRD.md`", `\`${answers.paths.prd}\``],
    ["`tests/invariants/`", `\`${answers.paths.invariants}/\``],
  ];
  return swaps.reduce((t, [from, to]) => t.split(from).join(to), text);
}

export function codeowners(answers: AdoptAnswers): string {
  return [
    "# Owner of the non-negotiable tests: only this owner's approval label counts for the invariant guard (adt-invariants).",
    `/${answers.paths.invariants}/ @${answers.owner}`,
    "",
  ].join("\n");
}

/** Owners of the invariants folder in an existing CODEOWNERS (last matching rule wins), to tell whether it is covered. */
export function invariantOwners(text: string, dir: string): string[] {
  let owners: string[] = [];
  for (const line of text.split("\n")) {
    const [pattern, ...rest] = line.replace(/#.*/, "").trim().split(/\s+/);
    if (!pattern) continue;
    const p = pattern.replace(/^\//, "").replace(/\/\*{0,2}$/, "");
    if (p === "*" || p === dir || dir.startsWith(`${p}/`)) owners = rest.map((o) => o.replace(/^@/, "").toLowerCase());
  }
  return owners;
}

export function adtConfig(answers: AdoptAnswers, repository: string, release: string): string {
  const config: AdtConfig = {
    $comment:
      "ai-dev-template, adopted with /adt:adopt. Observe mode: the checks below report on every PR but are not required. /adt:check-setup reads this file.",
    template: { repository, release },
    mode: "observe",
    observeChecks: OBSERVE_CHECKS,
    requiredChecks: answers.requiredChecks,
    labels: answers.labels,
    paths: answers.paths,
    evals: answers.evals,
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
