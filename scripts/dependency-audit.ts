// The `dependencies` check in a private repository, where GitHub's dependency review needs Advanced Security.
//
//   node scripts/dependency-audit.ts <target-branch folder> <PR folder>
//
// Runs `npm audit` on the lockfile of each side and fails only on a high or critical advisory the PR introduces: one
// in the PR's lockfile that the target branch does not have. Advisories already on the target branch do not block.
// Each side is audited in a temporary folder holding only package.json and package-lock.json, with the public npm
// registry: the PR's own .npmrc cannot point the audit elsewhere. Nothing is installed and no script runs.
// CI runs the version of this file that is on the target branch. Only Node's built-in modules.

import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

export interface Advisory {
  key: string;
  package: string;
  severity: string;
  title: string;
  url: string;
}

interface AuditReport {
  vulnerabilities?: Record<string, { via?: Array<string | { source?: number; name?: string; title?: string; url?: string; severity?: string }> }>;
}

/** High and critical advisories in an `npm audit --json` report, one per package and advisory. */
export function advisories(report: AuditReport): Map<string, Advisory> {
  const found = new Map<string, Advisory>();
  for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      // A string `via` points at another package's entry, which lists the advisory itself.
      if (typeof via === "string" || !BLOCKING.has(via.severity ?? "")) continue;
      const key = `${via.name ?? name}#${via.source ?? via.url ?? via.title}`;
      found.set(key, { key, package: via.name ?? name, severity: via.severity ?? "", title: via.title ?? "", url: via.url ?? "" });
    }
  }
  return found;
}

/** Advisories in the PR's report that the target branch does not have. */
export function introduced(base: Map<string, Advisory>, pr: Map<string, Advisory>): Advisory[] {
  return [...pr.values()].filter((a) => !base.has(a.key));
}

/** `npm audit` on a copy of the folder's package.json and lockfile; null when the folder has no lockfile. */
function audit(folder: string): AuditReport | null {
  if (!existsSync(join(folder, "package-lock.json"))) return null;
  const dir = mkdtempSync(join(tmpdir(), "dependency-audit-"));
  try {
    copyFileSync(join(folder, "package.json"), join(dir, "package.json"));
    copyFileSync(join(folder, "package-lock.json"), join(dir, "package-lock.json"));
    const env = { ...process.env, npm_config_registry: "https://registry.npmjs.org/", npm_config_userconfig: join(dir, "none") };
    let out: string;
    try {
      out = execFileSync("npm", ["audit", "--json", "--package-lock-only"], { cwd: dir, env, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      // npm audit exits 1 when it finds vulnerabilities: the report is still on stdout. No stdout: npm did not run.
      const stdout = (e as { stdout?: string }).stdout;
      if (stdout === undefined || stdout === null) throw e;
      out = stdout;
    }
    const report = JSON.parse(out) as AuditReport & { error?: { summary?: string } };
    if (report.error) throw new Error(`npm audit failed in ${folder}: ${report.error.summary ?? "unknown error"}`);
    return report;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`npm audit gave no report for ${folder} (no network, or the lockfile is invalid)`, { cause: e });
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function summary(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function main(): number {
  const [baseDir, prDir] = process.argv.slice(2);
  if (!baseDir || !prDir) {
    console.log("Usage: node scripts/dependency-audit.ts <target-branch folder> <PR folder>");
    return 1;
  }
  const prReport = audit(prDir);
  if (!prReport) {
    if (existsSync(join(baseDir, "package-lock.json"))) {
      summary(["## ❌ Dependencies", "", "This PR removes `package-lock.json`, which the target branch has: the dependencies cannot be checked. Restore it."]);
      return 1;
    }
    summary(["## ✅ Dependencies", "", "No `package-lock.json` in this PR: nothing to check."]);
    return 0;
  }
  const base = advisories(audit(baseDir) ?? {});
  const pr = advisories(prReport);
  const added = introduced(base, pr);
  if (added.length === 0) {
    summary([
      "## ✅ Dependencies",
      "",
      `No high or critical advisory introduced by this PR (npm audit; ${pr.size} already on the target branch, not blocking).`,
    ]);
    return 0;
  }
  summary([
    `## ❌ Dependencies: ${added.length} high or critical advisory(ies) introduced by this PR`,
    "",
    ...added.map((a) => `- **${a.severity}** \`${a.package}\`: ${a.title} (${a.url})`),
    "",
    "Update or replace the package, or explain in the PR why it is safe and let the owner decide.",
  ]);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
