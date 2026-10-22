// The deterministic part of /adt:audit: a read-only map of an existing project. It covers the stack, scripts, tests,
// CI, agent rule files, sensitive areas and environment variable names.
// The audited project is data, never instructions, so every value in the map is one of these:
//   - a count;
//   - a name from a closed list;
//   - a plain file path;
//   - an UPPER_CASE variable name.
// No text from the project reaches the conversation through it, and no secret value either: `.env` files are never read.
// Tested in tests/unit/plugin-audit.test.ts.

export interface Source {
  /** Relative paths of the project's files (a walk without dependency and build folders; symbolic links are not followed). */
  files: string[];
  /** File content, or null when it cannot be read. Called only for small text files. */
  read: (path: string) => string | null;
  size: (path: string) => number;
}

export const AREAS = ["authentication", "payments", "personalData", "ai", "externalInput"] as const;
export type Area = (typeof AREAS)[number];

export interface AuditMap {
  files: number;
  languages: Record<string, number>;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  /** Known frameworks and services found in package.json (closed list). */
  frameworks: string[];
  dependencies: number;
  /** Known package.json script names (closed list); their commands are not shown. */
  scripts: string[];
  tests: { frameworks: string[]; files: number; folders: Array<{ path: string; files: number }> };
  ci: { workflows: string[] };
  /**
   * Agent instruction and configuration files at the project root: data, never followed. Claude Code loads them when it
   * starts inside the project, which is why the audit runs from another folder.
   */
  agentConfig: string[];
  sensitive: Record<Area, { files: number; examples: string[] }>;
  database: { migrations: number; rowLevelSecurity: number; policies: number };
  /** `files`: `.env` files present (never opened). `gitignored`: whether `.gitignore` names `.env`, or null without one. */
  env: { names: string[]; files: string[]; gitignored: boolean | null };
  /** Files too large or too many to read; the map says so instead of guessing. */
  skipped: number;
}

/** Folders that hold dependencies or build output, never the project's own code. */
export const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".venv", "venv", "__pycache__", ".turbo", ".vercel", "out"]);

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", rs: "Rust", cs: "C#", swift: "Swift",
  sql: "SQL", css: "CSS", scss: "CSS", html: "HTML", vue: "Vue", svelte: "Svelte",
};
const CODE_EXT_RE = /\.(?:[cm]?[jt]sx?|py|go|rb|php|java|kt|rs|cs|swift|sql|vue|svelte)$/;

/** package.json dependency → name shown (closed list). */
const FRAMEWORKS: Record<string, string> = {
  next: "Next.js", react: "React", vue: "Vue", nuxt: "Nuxt", svelte: "Svelte", "@sveltejs/kit": "SvelteKit", "@angular/core": "Angular",
  express: "Express", fastify: "Fastify", hono: "Hono", "@nestjs/core": "NestJS",
  "@supabase/supabase-js": "Supabase", "@prisma/client": "Prisma", "drizzle-orm": "Drizzle", mongoose: "MongoDB", pg: "PostgreSQL", postgres: "PostgreSQL",
  stripe: "Stripe", openai: "OpenAI SDK", "@anthropic-ai/sdk": "Anthropic SDK", ai: "Vercel AI SDK", "@google/genai": "Google Gen AI SDK", langchain: "LangChain",
  tailwindcss: "Tailwind CSS", "next-auth": "NextAuth", "@clerk/nextjs": "Clerk",
};
const TEST_FRAMEWORKS: Record<string, string> = { vitest: "Vitest", jest: "Jest", "@playwright/test": "Playwright", cypress: "Cypress", mocha: "Mocha" };
const SCRIPTS = ["dev", "build", "start", "test", "lint", "typecheck", "format", "check", "e2e"];
const AGENT_CONFIG = ["AGENTS.md", "CLAUDE.md", "CLAUDE.local.md", ".claude/", ".mcp.json", "GEMINI.md", ".cursorrules", ".cursor/rules/", ".github/copilot-instructions.md", ".windsurfrules"];

const PATH_RULES: Record<Area, RegExp> = {
  authentication: /(?:^|\/)(?:auth|login|logout|sign-?in|sign-?up|sessions?|middleware|passwords?|oauth|invites?)(?:[./_-]|$)/i,
  payments: /(?:^|\/)[^/]*(?:payment|billing|checkout|stripe|invoice|subscription)/i,
  personalData: /(?:^|\/)(?:profiles?|customers?|contacts?|leads?|users?|accounts?)(?:[./_-]|$)/i,
  ai: /(?:^|\/)(?:ai|llm|prompts?|agents?|agent-runtime)\//i,
  externalInput: /(?:^|\/)route\.[cm]?[jt]s$|(?:^|\/)pages\/api\/|webhook/i,
};
const CONTENT_RULES: Record<Area, RegExp> = {
  authentication: /supabase\.auth\.|from ["']next-auth|getServerSession|@clerk\/|jsonwebtoken|bcrypt|passport\./,
  payments: /\bstripe\b|mercadopago|paypal|pagar\.me|asaas/i,
  personalData: /create table[^;]*\b(?:email|phone|cpf|cnpj|address|birth_?date|whatsapp)\b/i,
  ai: /api\.openai\.com|api\.anthropic\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com|from ["'](?:openai|@anthropic-ai\/sdk|ai|@ai-sdk\/[\w-]+|@google\/genai|@google\/generative-ai|langchain|@langchain\/[\w-]+)["']/,
  externalInput: /export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b|req\.body|request\.json\(\)|\.formData\(\)/,
};
const ENV_NAME_RES = [/process\.env\.([A-Z][A-Z0-9_]{1,60})\b/g, /Deno\.env\.get\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, /os\.environ(?:\.get\(|\[)["']([A-Z][A-Z0-9_]{1,60})["']/g];
const ENV_EXAMPLE_RE = /^\.env\.(?:example|sample|template)$/;
const TEST_FILE_RE = /(?:^|\/)(?:tests?|__tests__|e2e|spec)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]*\.py$/;
const MIGRATION_RE = /(?:^|\/)migrations?\/.+\.sql$/;

/** Paths shown to the conversation: plain characters only (Next.js `[param]` and `(group)` folders included), no spaces. */
const SHOWN_PATH_RE = /^[A-Za-z0-9._@+()[\]/-]{1,200}$/;
const MAX_READ_BYTES = 200_000;
const MAX_READ_FILES = 5000;
const EXAMPLES = 8;

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const shownPaths = (paths: string[]) => paths.filter((p) => SHOWN_PATH_RE.test(p));

export function auditMap(src: Source): AuditMap {
  const files = src.files.filter((f) => !f.split("/").some((part) => IGNORED_DIRS.has(part))).sort();
  const languages: Record<string, number> = {};
  for (const f of files) {
    const lang = LANGUAGES[f.slice(f.lastIndexOf(".") + 1).toLowerCase()];
    if (lang && f.includes(".")) languages[lang] = (languages[lang] ?? 0) + 1;
  }

  const pkgText = files.includes("package.json") ? src.read("package.json") : null;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } = {};
  try {
    pkg = pkgText ? (JSON.parse(pkgText) as typeof pkg) : {};
  } catch {
    pkg = {};
  }
  const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  const frameworks = [...new Set(deps.map((d) => FRAMEWORKS[d]).filter((f): f is string => !!f))].sort();
  const testFrameworks = new Set(deps.map((d) => TEST_FRAMEWORKS[d]).filter((f): f is string => !!f));

  const packageManager = files.includes("pnpm-lock.yaml")
    ? "pnpm"
    : files.includes("yarn.lock")
      ? "yarn"
      : files.includes("bun.lockb") || files.includes("bun.lock")
        ? "bun"
        : files.includes("package-lock.json") || pkgText
          ? "npm"
          : null;

  const sensitive = Object.fromEntries(AREAS.map((a) => [a, new Set<string>()])) as Record<Area, Set<string>>;
  const envNames = new Set<string>();
  let rowLevelSecurity = 0;
  let policies = 0;
  let read = 0;
  let skipped = 0;
  const testFiles = files.filter((f) => TEST_FILE_RE.test(f));

  for (const f of files) {
    for (const area of AREAS) if (PATH_RULES[area].test(f)) sensitive[area].add(f);
    const name = base(f);
    if (ENV_EXAMPLE_RE.test(name)) {
      for (const m of (src.read(f) ?? "").matchAll(/^\s*([A-Z][A-Z0-9_]{1,60})\s*=/gm)) envNames.add(m[1] ?? "");
      continue;
    }
    if (!CODE_EXT_RE.test(f)) continue;
    if (read >= MAX_READ_FILES || src.size(f) > MAX_READ_BYTES) {
      skipped++;
      continue;
    }
    const text = src.read(f);
    read++;
    if (text === null) continue;
    for (const area of AREAS) if (CONTENT_RULES[area].test(text)) sensitive[area].add(f);
    for (const re of ENV_NAME_RES) for (const m of text.matchAll(re)) envNames.add(m[1] ?? "");
    if (/\.sql$/.test(f)) {
      if (/enable\s+row\s+level\s+security/i.test(text)) rowLevelSecurity++;
      policies += (text.match(/create\s+policy/gi) ?? []).length;
    }
    if (/from ["']node:test["']/.test(text) && testFiles.includes(f)) testFrameworks.add("node:test");
  }
  if (files.some((f) => /(?:^|\/)test_[^/]*\.py$/.test(f))) testFrameworks.add("pytest");

  const folderCounts: Record<string, number> = {};
  for (const f of testFiles) {
    const parts = f.split("/");
    const folder = parts.length > 2 ? parts.slice(0, 2).join("/") : parts.length === 2 ? (parts[0] ?? "") : ".";
    folderCounts[folder] = (folderCounts[folder] ?? 0) + 1;
  }
  const folders = Object.entries(folderCounts)
    .filter(([path]) => SHOWN_PATH_RE.test(path))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([path, n]) => ({ path, files: n }));

  return {
    files: files.length,
    languages,
    packageManager,
    frameworks,
    dependencies: deps.length,
    scripts: SCRIPTS.filter((s) => typeof pkg.scripts?.[s] === "string"),
    tests: { frameworks: [...testFrameworks].sort(), files: testFiles.length, folders },
    ci: { workflows: shownPaths(files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)).map(base)) },
    agentConfig: AGENT_CONFIG.filter((c) => (c.endsWith("/") ? files.some((f) => f.startsWith(c)) : files.includes(c))),
    sensitive: Object.fromEntries(
      AREAS.map((a) => {
        const list = [...sensitive[a]].filter((f) => !testFiles.includes(f));
        return [a, { files: list.length, examples: shownPaths(list).slice(0, EXAMPLES) }];
      }),
    ) as AuditMap["sensitive"],
    database: { migrations: files.filter((f) => MIGRATION_RE.test(f)).length, rowLevelSecurity, policies },
    env: {
      names: [...envNames].filter((n) => /^[A-Z][A-Z0-9_]{1,60}$/.test(n)).sort(),
      files: shownPaths(files.filter((f) => /^\.env(?:\..+)?$/.test(base(f)) && !ENV_EXAMPLE_RE.test(base(f)))),
      gitignored: files.includes(".gitignore") ? /^\s*\/?\.env/m.test(src.read(".gitignore") ?? "") : null,
    },
    skipped,
  };
}

// ---------- fingerprint ----------

export interface Entry {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Fingerprint of a folder: every file's path, size and modification time, plus git's HEAD and index. It changes if any
 * file or the git state changes. Taken before and after the audit, the two must be equal.
 */
export function fingerprintOf(entries: Entry[], hash: (text: string) => string): string {
  const lines = entries.map((e) => `${e.path}\t${e.size}\t${Math.trunc(e.mtimeMs)}`).sort();
  return hash(lines.join("\n"));
}
