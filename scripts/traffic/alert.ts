// Makes a broken traffic export impossible to miss: opens (or updates, with a comment that notifies the owner) one
// issue when the export fails or its token is about to expire, and closes it once the export works again.
// Uses the workflow token (issues: write), never TRAFFIC_TOKEN.
//
// Use in CI: node scripts/traffic/alert.ts --status failure|success
//   TRAFFIC_ALERT_FILE: what run.ts wrote (the reason it failed, or that the token expires soon). Missing on
//   failure = a later step failed (e.g. the push): the issue says so and links the run.

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ALERT_LABEL, ALERT_MARKER, renderAlert } from "./lib.ts";

const { values } = parseArgs({ options: { status: { type: "string" } } });
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, TRAFFIC_ALERT_FILE: alertFile } = process.env;
const api = process.env.GITHUB_API_URL || "https://api.github.com";
const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;

async function gh<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${api}/repos/${repo}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

type Alert = { kind: "failure"; reason: string } | { kind: "expiring"; days: number };

function readAlert(): Alert | null {
  if (!alertFile || !existsSync(alertFile)) return null;
  const text = readFileSync(alertFile, "utf-8").trim();
  return text ? (JSON.parse(text) as Alert) : null;
}

async function main(): Promise<void> {
  if (!token || !repo) throw new Error("missing GITHUB_TOKEN or GITHUB_REPOSITORY");
  if (values.status !== "failure" && values.status !== "success") throw new Error("use --status failure or --status success");

  const issues = await gh<Array<{ number: number; body?: string | null; html_url: string }>>(
    `/issues?state=open&creator=${encodeURIComponent("github-actions[bot]")}&per_page=100`,
  );
  const existing = issues.find((i) => i.body?.includes(ALERT_MARKER));
  const found = readAlert();
  const alert: Alert | null =
    values.status === "failure"
      ? found?.kind === "failure"
        ? found
        : { kind: "failure", reason: "A step after the export failed (e.g. saving the data to the `traffic` branch): see the run." }
      : found?.kind === "expiring"
        ? found
        : null;

  if (!alert) {
    if (existing) {
      await gh(`/issues/${existing.number}/comments`, { method: "POST", body: { body: `✅ The traffic export works again: ${runUrl}` } });
      await gh(`/issues/${existing.number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
      console.log(`Alert closed: ${existing.html_url}`);
    }
    return;
  }

  const { title, body } = renderAlert({ ...alert, runUrl });
  if (existing) {
    await gh(`/issues/${existing.number}`, { method: "PATCH", body: { title, body } });
    await gh(`/issues/${existing.number}/comments`, { method: "POST", body: { body: `Still needs attention: ${title}. ${runUrl}` } });
    console.log(`Alert updated: ${existing.html_url}`);
  } else {
    // The label only helps to find the issue; if it cannot be applied, the alert still opens without it.
    const created = await gh<{ html_url: string }>("/issues", { method: "POST", body: { title, body, labels: [ALERT_LABEL] } }).catch(() =>
      gh<{ html_url: string }>("/issues", { method: "POST", body: { title, body } }),
    );
    console.log(`Alert opened: ${created.html_url}`);
  }
}

main().catch((error: unknown) => {
  console.error(`::error::Could not open the traffic alert issue: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
