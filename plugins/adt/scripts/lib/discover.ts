// The deterministic parts of /adt:discover:
// - the project's state before the conversation;
// - the skills and MCPs suggested from a fixed catalog;
// - the checks the PRD and missions written by Claude must pass.
// It never writes a file: Claude writes, the owner approves, this checks.
// Tested in tests/unit/plugin-discover.test.ts.

export interface Files {
  /** A file in the project folder (relative path), or null if it does not exist. */
  read: (path: string) => string | null;
  /** Names in a folder of the project, or [] if it does not exist. */
  list: (dir: string) => string[];
}

export interface Invariant {
  id: string;
  file: string;
}

export interface ProjectState {
  /** `starter`: still the template's PRD, with its (example) rows. */
  prd: "missing" | "starter" | "filled";
  /** Files of the template's demo app (the sample store) still in the project; [] once it is removed. */
  demo: string[];
  /** Invariant IDs that already have a test, and where. */
  invariants: Invariant[];
  /** The next free invariant ID: IDs are never reused, so a removed rule's ID never comes back with another meaning. */
  nextInvariant: string;
  missions: string[];
  nextMission: string;
}

const INV_RE = /\bINV-(\d{3})(?!\d)/g; // also INV-001a, the test-name form
const MISSION_FILE_RE = /^(\d{4})-[a-z0-9-]+\.md$/;
/** The template's demo app: its code, tests, invariants and golden set (`evals/targets.ts` and `evals/config.json` name it too). */
export const DEMO_FILES = [
  "src/pricing.ts",
  "src/ai/classify-message.ts",
  "tests/unit/pricing.test.ts",
  "tests/unit/classify-message.test.ts",
  "tests/invariants/pricing.invariant.test.ts",
  "tests/invariants/llm-output.invariant.test.ts",
  "evals/golden/classify-message.jsonl",
];

/** File names shown to the conversation: plain names only; any other name is still read but shown as a placeholder. */
const SHOWN_FILE_RE = /^[A-Za-z0-9._-]{1,80}$/;

/** Invariant IDs found in the test files of `tests/invariants/`. */
export function invariantsOf(files: Files): Invariant[] {
  const out: Invariant[] = [];
  for (const name of files.list("tests/invariants").filter((n) => n.endsWith(".ts")).sort()) {
    const ids = new Set([...(files.read(`tests/invariants/${name}`) ?? "").matchAll(INV_RE)].map((m) => `INV-${m[1]}`));
    const file = SHOWN_FILE_RE.test(name) ? `tests/invariants/${name}` : "tests/invariants/(a file with an unusual name)";
    for (const id of ids) out.push({ id, file });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file));
}

export function projectState(files: Files): ProjectState {
  const prd = files.read("specs/PRD.md");
  const invariants = invariantsOf(files);
  const used = [...invariants.map((i) => i.id), ...[...(prd ?? "").matchAll(INV_RE)].map((m) => `INV-${m[1]}`)];
  const top = Math.max(0, ...used.map((id) => Number(id.slice(4))));
  const missions = files.list("docs/missions").filter((n) => MISSION_FILE_RE.test(n)).sort();
  const lastMission = Math.max(0, ...missions.map((n) => Number(n.slice(0, 4))));
  return {
    prd: prd === null ? "missing" : prd.includes("(example)") ? "starter" : "filled",
    demo: DEMO_FILES.filter((f) => files.read(f) !== null),
    invariants,
    nextInvariant: `INV-${String(top + 1).padStart(3, "0")}`,
    missions,
    nextMission: String(lastMission + 1).padStart(4, "0"),
  };
}

/** Missions that are still to be done (draft, approved or in progress): the ones discovery writes or plans with. */
export function openMissions(files: Files): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of files.list("docs/missions").filter((n) => MISSION_FILE_RE.test(n))) {
    const text = files.read(`docs/missions/${name}`) ?? "";
    const status = /^\*\*Status:\*\*\s*(.+)$/m.exec(text)?.[1]?.trim().toLowerCase() ?? "";
    if (/^(draft|approved|in progress)\b/.test(status)) out[name] = text;
  }
  return out;
}

// ---------- suggestions ----------

export const NEEDS = ["ui", "react", "libraries", "sensitive"] as const;
export type Need = (typeof NEEDS)[number];

export interface Tool {
  id: string;
  kind: "skill" | "mcp" | "built-in";
  /** What it helps with, in one line. */
  for: string;
  when: Need[];
  /** Command the user runs in their own terminal; null when it is built into Claude Code. */
  install: string | null;
  source: string;
}

/** `ui,react` → the needs, checked against the closed list. */
export function parseNeeds(raw: string): { needs: Need[] } | { errors: string[] } {
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const needs = list.filter((s): s is Need => (NEEDS as readonly string[]).includes(s));
  if (needs.length !== list.length) return { errors: [`needs: comma-separated, from ${NEEDS.join(", ")} (or empty)`] };
  return { needs: [...new Set(needs)] };
}

/** Catalog entries that match at least one need, in catalog order. Only the catalog: never a name from the conversation. */
export function suggestTools(catalog: Tool[], needs: Need[]): Tool[] {
  return catalog.filter((t) => t.when.some((w) => needs.includes(w)));
}

// ---------- checks ----------

/** Content of a `## Title` section (up to the next `#` or `##` heading). Matches the start of the title, after a number. */
export function section(markdown: string, titleStart: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+(?:\d+\.\s+)?/, "").startsWith(titleStart));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

/** Rows of the first Markdown table in the text (without header or separator), split into cells. */
export function tableRows(markdown: string): string[][] {
  const lines = markdown.split("\n");
  const first = lines.findIndex((l) => l.trim().startsWith("|"));
  if (first === -1) return [];
  const end = lines.findIndex((l, i) => i > first && !l.trim().startsWith("|"));
  return lines
    .slice(first, end === -1 ? undefined : end)
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split(/(?<!\\)\|/)
        .map((c) => c.trim()),
    )
    .slice(2);
}

/** Text without HTML comments, blockquotes and blank lines: what is left is what the author wrote. */
function prose(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith(">"))
    .join("\n")
    .trim();
}

/** `[criterion]`, `[YYYY-MM-DD]`…: template placeholders. Links, checkboxes and inline code are not placeholders. */
export function placeholders(text: string): string[] {
  const plain = text.replace(/`[^`\n]*`/g, "");
  return [...plain.matchAll(/\[([^\]\n]+)\](?![(:])/g)].map((m) => m[1] ?? "").filter((p) => !/^[ xX]$/.test(p));
}

const PRD_MAX_CHARS = 8000;
const CA_ID_RE = /^CA-\d{2,3}$/;
const INV_ID_RE = /^INV-\d{3}$/;
const INV_TEST_RE = /tests\/invariants\/[a-z0-9-]+\.invariant\.test\.ts/;
const PROTOTYPE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MIN_CASES = 3;

export interface CheckInput {
  prd: string | null;
  /** Open missions (file name → text). */
  missions: Record<string, string>;
  /** Invariant tests that already exist. */
  invariants: Invariant[];
  /** Topic of the throwaway prototype the owner agreed to, if any. */
  prototype?: string;
  /** The product has screens: its first slice comes with a separate end-to-end test mission. */
  e2e?: boolean;
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

const quote = (items: string[]) => items.map((p) => `[${p.slice(0, 40)}]`).join(", ");

/** The checks of M7c criteria 1, 2 and 4 on what discovery wrote. Every problem says how to fix it. */
export function checkDiscovery(input: CheckInput): CheckResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const done = (): CheckResult => ({ ok: problems.length === 0, problems, warnings });
  const { prd } = input;
  if (prd === null) {
    problems.push("specs/PRD.md does not exist.");
    return done();
  }

  if (prd.length > PRD_MAX_CHARS) problems.push(`specs/PRD.md has ${prd.length} characters; keep it under ${PRD_MAX_CHARS} (about 2 pages): cut.`);
  if (prd.includes("(example)")) problems.push("specs/PRD.md still has the template's (example) parts (rows and the note at the top): remove them.");
  const left = placeholders(prd);
  if (left.length) problems.push(`specs/PRD.md still has template placeholders: ${quote(left.slice(0, 3))}.`);

  const titles = ["Goal", "Users", "Acceptance criteria", "Non-negotiables", "Out of scope", "Direction check"];
  const sections = Object.fromEntries(titles.map((t) => [t, section(prd, t)]));
  const missing = titles.filter((t) => sections[t] === null);
  if (missing.length) problems.push(`specs/PRD.md is missing the section(s): ${missing.join(", ")}. Keep the template's sections.`);

  if (sections.Goal !== null && !prose(sections.Goal ?? "")) problems.push("Goal: write one or two sentences (what problem, for whom).");
  if (sections.Users !== null && !tableRows(sections.Users ?? "").some((r) => r[0] && r[1])) problems.push("Users: add at least one row (who, what they need).");

  // Acceptance criteria: an ID, a criterion, and a way to verify it that someone (or a test) can run.
  const criteria = tableRows(sections["Acceptance criteria"] ?? "");
  if (sections["Acceptance criteria"] !== null && criteria.length === 0) problems.push("Acceptance criteria: add at least one row.");
  const caIds: string[] = [];
  for (const [id = "", text = "", verify = ""] of criteria) {
    if (!CA_ID_RE.test(id)) problems.push(`Acceptance criteria: "${id.slice(0, 20)}" is not an ID like CA-01.`);
    else if (caIds.includes(id)) problems.push(`Acceptance criteria: ${id} appears twice.`);
    else caIds.push(id);
    if (!text) problems.push(`${id}: the criterion is empty.`);
    if (!verify.includes("`") && !/^manual:/i.test(verify))
      problems.push(`${id}: "How to verify" must name a test or a command in backticks, or a manual step starting with "Manual:".`);
  }

  // Non-negotiables: an ID never used before, a rule, its test file, and cases until that test exists.
  const nn = sections["Non-negotiables"] ?? "";
  const rules = tableRows(nn);
  if (sections["Non-negotiables"] !== null && rules.length === 0) problems.push("Non-negotiables: add at least one rule that must never break.");
  const missionTexts = Object.values(input.missions);
  const invIds: string[] = [];
  for (const [id = "", rule = "", testCell = ""] of rules) {
    if (!INV_ID_RE.test(id)) {
      problems.push(`Non-negotiables: "${id.slice(0, 20)}" is not an ID like INV-001.`);
      continue;
    }
    if (invIds.includes(id)) problems.push(`Non-negotiables: ${id} appears twice.`);
    invIds.push(id);
    if (!rule) problems.push(`${id}: the rule is empty.`);
    const file = INV_TEST_RE.exec(testCell)?.[0];
    if (!file) {
      problems.push(`${id}: name its test file in the Test column, like \`tests/invariants/<topic>.invariant.test.ts\`.`);
      continue;
    }
    const owner = input.invariants.find((i) => i.id === id);
    if (owner && owner.file !== file) {
      problems.push(`${id} is already used by \`${owner.file}\`. IDs are never reused: give this rule a new ID.`);
      continue;
    }
    if (owner) continue; // its test exists: the cases live there
    const cases = casesOf(nn, id);
    if (cases === null) problems.push(`${id}: add a "### ${id} cases" list under Non-negotiables (its test is created with the mission that implements the rule).`);
    else {
      const examples = cases.filter((c) => c.includes("→")).length;
      if (examples < MIN_CASES) problems.push(`${id} cases: at least ${MIN_CASES} "input → expected" bullets, edge values included (found ${examples}).`);
      if (!cases.some((c) => /^catches a violation:/i.test(c)))
        problems.push(`${id} cases: add a "Catches a violation: …" bullet (how to break the code on purpose and see the test fail).`);
    }
    if (!missionTexts.some((t) => t.includes(id) && t.includes(file)))
      problems.push(`${id}: no open mission in docs/missions/ plans its test. Name ${id} and \`${file}\` in the mission that implements the rule.`);
  }

  const orphans = input.invariants.filter((i) => !invIds.includes(i.id));
  if (orphans.length) {
    const list = orphans.map((i) => `${i.id} (\`${i.file}\`)`).join(", ");
    warnings.push(`tests/invariants/ has ${list}, not in the PRD. They stay until a mission removes them, with the owner's \`invariant-approved\` label.`);
  }

  if (sections["Out of scope"] !== null && !/^\s*[-*]\s+\S/m.test(prose(sections["Out of scope"] ?? "")))
    problems.push("Out of scope: list at least one thing this project will not do.");

  const directionIds = new Set(tableRows(sections["Direction check"] ?? "").map((r) => r[0] ?? ""));
  const absent = [...caIds, ...invIds].filter((id) => !directionIds.has(id));
  if (sections["Direction check"] !== null && absent.length) problems.push(`Direction check: add a row (status ⬜) for ${absent.join(", ")}.`);

  // Missions written now: no template placeholders, and an acceptance table.
  for (const [name, text] of Object.entries(input.missions)) {
    const holes = placeholders(text);
    if (holes.length) problems.push(`docs/missions/${name} still has template placeholders: ${quote(holes.slice(0, 3))}.`);
    if (!tableRows(section(text, "Acceptance") ?? "").length) problems.push(`docs/missions/${name}: the Acceptance table has no rows.`);
  }
  if (Object.keys(input.missions).length === 0) problems.push("docs/missions/: write the first mission (copy `_TEMPLATE.md`, Status: draft).");

  // A product with screens: the end-to-end tests of the first slice are a mission of their own, planned from the
  // acceptance criteria before the code (AGENTS.md, Evidence), not written by the same pass that writes the code.
  if (input.e2e) {
    const e2eMission = Object.entries(input.missions).find(([, t]) => /^# Mission \d+: End-to-end tests\b/m.test(t));
    if (!e2eMission) problems.push('The product has screens: add a separate mission "# Mission NNNN: End-to-end tests of <the main flow>", planned from the acceptance criteria.');
    else {
      const [name, text] = e2eMission;
      if (!text.includes("specs/e2e/")) problems.push(`docs/missions/${name}: its first item writes the test plan in \`specs/e2e/\`, from the acceptance criteria, before the code mission starts.`);
      if (!caIds.some((id) => text.includes(id))) problems.push(`docs/missions/${name}: name the acceptance criteria (CA-xx) its tests cover; each test title starts with one.`);
    }
  }

  if (input.prototype !== undefined) {
    if (!PROTOTYPE_RE.test(input.prototype)) problems.push("prototype: a topic in lowercase letters, digits and hyphens.");
    else if (!missionTexts.some((t) => t.includes(`prototype/${input.prototype}`)))
      problems.push(`The prototype was agreed but no open mission starts with it: add an item "throwaway prototype in \`prototype/${input.prototype}\`" before the implementation.`);
  }
  return done();
}

/** The clickable mockup's folder, from the project's root. */
export const MOCKUP_DIR = "prototype/mockup";

/**
 * The throwaway mockup discovery shows before writing the PRD: plain HTML pages in `prototype/mockup/`, one per
 * screen of the main flow. It works offline, sends nothing anywhere, says on every page that it is a mockup, and every
 * link between pages leads to a page that exists. Pages: file name → text.
 */
export function checkMockup(pages: Record<string, string>): CheckResult {
  const problems: string[] = [];
  const names = Object.keys(pages);
  if (!names.includes("index.html")) problems.push(`${MOCKUP_DIR}/index.html is missing: it is the first screen, which links to the others.`);
  for (const [name, html] of Object.entries(pages)) {
    const file = `${MOCKUP_DIR}/${name}`;
    if (!/<body[^>]*\bdata-mockup\b/i.test(html)) problems.push(`${file}: mark the page as a mockup (<body data-mockup>) and show a banner saying it is not the real app.`);
    if (/<script\b/i.test(html)) problems.push(`${file}: no scripts. A mockup is plain pages and links.`);
    // Nothing loads from or goes to the network: no CDN, font, image, form target or tracking.
    if (/(?:src|href|action)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/|@import/i.test(html))
      problems.push(`${file}: everything inline, nothing from the network (no CDN, web font, remote image, form target or @import).`);
    for (const [, target] of html.matchAll(/href\s*=\s*["']([^"'#?]+\.html)/gi)) {
      if (target && !names.includes(target)) problems.push(`${file} links to ${target}, which does not exist in ${MOCKUP_DIR}/.`);
    }
  }
  if (names.length === 0) problems.push(`${MOCKUP_DIR}/ has no pages.`);
  return { ok: problems.length === 0, problems, warnings: [] };
}

/** Bullets of the `### INV-00N cases` subsection, or null if there is none. */
function casesOf(nonNegotiables: string, id: string): string[] | null {
  const lines = nonNegotiables.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^###\\s+${id}\\b`).test(l));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,3}\s/.test(l));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim());
}
