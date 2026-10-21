// Weekly traffic export: GitHub keeps a repository's traffic (views, clones, popular pages, referrers) for
// 14 days only. This script adds the current window to versioned CSV files, so the history is not lost.
//
// Use in CI: node scripts/traffic/run.ts --out <folder>
//   TRAFFIC_TOKEN: fine-grained token with "Administration: read" on this repository only (the workflow
//   token cannot read traffic). GITHUB_REPOSITORY: owner/repo.
//   TRAFFIC_ALERT_FILE (optional): where to write what went wrong, or that the token expires soon,
//   for scripts/traffic/alert.ts to turn into an issue.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PATHS_HEADER, REFERRERS_HEADER, expiresSoon, failureReason, mergeDaily, mergeSnapshot, parseExpiry } from "./lib.ts";
import type { DailyCount } from "./lib.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const { TRAFFIC_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
const api = process.env.GITHUB_API_URL || "https://api.github.com";

const alertFile = process.env.TRAFFIC_ALERT_FILE;
let expiry: Date | null = null;

/** An error whose message is already the reason to show the owner. */
class ExportError extends Error {}

async function gh<T>(path: string): Promise<T> {
  const response = await fetch(`${api}/repos/${repo}/traffic/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new ExportError(`${failureReason(response.status)} (GET traffic/${path})`);
  expiry ??= parseExpiry(response.headers.get("github-authentication-token-expiration"));
  return (await response.json()) as T;
}

function update(file: string, merge: (existing: string) => string): void {
  const existing = existsSync(file) ? readFileSync(file, "utf-8") : "";
  writeFileSync(file, merge(existing));
}

async function main(): Promise<void> {
  if (!values.out) throw new Error("missing --out <folder>");
  if (!repo) throw new Error("missing GITHUB_REPOSITORY");
  if (!token) throw new ExportError(`${failureReason("missing")} Create a fine-grained token with "Administration: read" on this repository and save it with \`gh secret set TRAFFIC_TOKEN\` (see README.md, "Traffic export").`);

  const views = await gh<{ views: DailyCount[] }>("views?per=day");
  const clones = await gh<{ clones: DailyCount[] }>("clones?per=day");
  const paths = await gh<Array<{ path: string; title: string; count: number; uniques: number }>>("popular/paths");
  const referrers = await gh<Array<{ referrer: string; count: number; uniques: number }>>("popular/referrers");

  const captured = new Date().toISOString().slice(0, 10);
  mkdirSync(values.out, { recursive: true });
  update(join(values.out, "views.csv"), (e) => mergeDaily(e, views.views));
  update(join(values.out, "clones.csv"), (e) => mergeDaily(e, clones.clones));
  update(join(values.out, "paths.csv"), (e) =>
    mergeSnapshot(e, PATHS_HEADER, captured, paths.map((p) => [p.path, p.title, String(p.count), String(p.uniques)])),
  );
  update(join(values.out, "referrers.csv"), (e) =>
    mergeSnapshot(e, REFERRERS_HEADER, captured, referrers.map((r) => [r.referrer, String(r.count), String(r.uniques)])),
  );
  console.log(
    `Traffic saved (${captured}): ${views.views.length} day(s) of views, ${clones.clones.length} of clones, ${paths.length} popular page(s), ${referrers.length} referrer(s).`,
  );
  const days = expiresSoon(expiry, new Date());
  if (days !== null) {
    console.log(`::warning::TRAFFIC_TOKEN expires in ${days} day(s). Regenerate it and run \`gh secret set TRAFFIC_TOKEN\`.`);
    if (alertFile) writeFileSync(alertFile, JSON.stringify({ kind: "expiring", days }));
  }
}

main().catch((error: unknown) => {
  const reason = error instanceof ExportError ? error.message : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  console.error(`::error::Traffic export failed. ${reason}`);
  if (alertFile) writeFileSync(alertFile, JSON.stringify({ kind: "failure", reason }));
  process.exit(1);
});
