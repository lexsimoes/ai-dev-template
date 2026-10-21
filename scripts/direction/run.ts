// Checagem de direção semanal: abre (ou atualiza) uma issue com o estado do projeto para o dono revisar.
// Sem modelo de IA e sem segredos: só a API do GitHub com o token do workflow.
//
// Uso no CI: node scripts/direction/run.ts
// Uso local (só imprime a issue, não publica): node scripts/direction/run.ts --dry-run
//   (GITHUB_TOKEN e GITHUB_REPOSITORY opcionais; sem eles, as seções de PRs e execuções ficam vazias)

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DIRECTION_LABEL, DIRECTION_MARKER, renderIssue } from "./lib.ts";
import type { PullRequest, WorkflowRun } from "./lib.ts";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
const api = process.env.GITHUB_API_URL || "https://api.github.com";

async function gh<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${api}/repos/${repo}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function lastRun(workflow: string, query: string): Promise<WorkflowRun | null> {
  const data = await gh<{ workflow_runs: WorkflowRun[] }>(`/actions/workflows/${workflow}/runs?per_page=1&${query}`);
  return data.workflow_runs[0] ?? null;
}

async function main(): Promise<void> {
  const now = new Date();
  const online = Boolean(token && repo);
  if (!online && !values["dry-run"]) throw new Error("faltam GITHUB_TOKEN e GITHUB_REPOSITORY (ou use --dry-run)");

  const since = now.getTime() - 7 * 86_400_000;
  const closed = online ? await gh<PullRequest[]>("/pulls?state=closed&sort=updated&direction=desc&per_page=100") : [];
  const open = online ? await gh<PullRequest[]>("/pulls?state=open&sort=updated&direction=asc&per_page=100") : [];
  const { title, body } = renderIssue({
    now,
    prd: readFileSync("specs/PRD.md", "utf-8"),
    handoff: readFileSync("docs/HANDOFF.md", "utf-8"),
    exists: (p) => existsSync(p),
    merged: closed.filter((p) => p.merged_at && new Date(p.merged_at).getTime() >= since),
    open,
    mainCi: online ? await lastRun("ci.yml", "branch=main&event=push") : null,
    canary: online ? await lastRun("review-canary.yml", "event=schedule") : null,
  });

  console.log(`# ${title}\n\n${body}`);
  if (values["dry-run"]) return;

  // Uma issue aberta por vez: se a anterior ainda está aberta, ela é atualizada (e ganha um comentário, que notifica o dono).
  const issues = await gh<Array<{ number: number; body?: string | null; user?: { login?: string }; html_url: string }>>(
    `/issues?state=open&labels=${DIRECTION_LABEL}&per_page=100`,
  );
  const existing = issues.find((i) => i.user?.login === "github-actions[bot]" && i.body?.includes(DIRECTION_MARKER));
  if (existing) {
    await gh(`/issues/${existing.number}`, { method: "PATCH", body: { title, body } });
    await gh(`/issues/${existing.number}/comments`, { method: "POST", body: { body: `Atualizada: ${title.toLowerCase()}.` } });
    console.log(`\nIssue atualizada: ${existing.html_url}`);
  } else {
    const created = await gh<{ html_url: string }>("/issues", { method: "POST", body: { title, body, labels: [DIRECTION_LABEL] } });
    console.log(`\nIssue aberta: ${created.html_url}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
