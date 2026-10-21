// Guarda dos invariantes: quem pode aprovar (CODEOWNERS) e o fluxo do CI com uma API do GitHub falsa.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { lastLabeler, ownersOf } from "../../scripts/guard-invariants.ts";
import type { IssueEvent } from "../../scripts/guard-invariants.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/guard-invariants.ts");
const CODEOWNERS = "# comentário\n*  @todos\n/tests/invariants/   @Dono  @org/time\n/evals/ @outra\n";

test("CODEOWNERS: a última regra que casa vence; times ficam de fora", () => {
  assert.deepEqual(ownersOf(CODEOWNERS, "tests/invariants/"), ["dono"]);
  assert.deepEqual(ownersOf(CODEOWNERS, "src/x.ts"), ["todos"]);
  assert.deepEqual(ownersOf("", "tests/invariants/"), []);
});

test("rótulo: vale quem o aplicou por último", () => {
  const ev = (event: string, login: string, name = "invariante-aprovado"): IssueEvent => ({ event, label: { name }, actor: { login }, created_at: "t" });
  assert.equal(lastLabeler([ev("labeled", "dono"), ev("unlabeled", "dono"), ev("labeled", "agente")], "invariante-aprovado"), "agente");
  assert.equal(lastLabeler([ev("labeled", "dono", "outro")], "invariante-aprovado"), null);
});

let repo = "";
let server: http.Server;
let port = 0;
let labeler = "dono";
let apiStatus = 200;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

function write(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "c");
}

async function guard(labels: string[]): Promise<{ code: number; out: string }> {
  try {
    const { stdout } = await run("node", [SCRIPT], {
      cwd: repo,
      env: {
        ...process.env,
        EVENT_NAME: "pull_request",
        BASE_REF: "main",
        PR_LABELS: JSON.stringify(labels),
        PR_NUMBER: "1",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_TOKEN: "falso",
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        GITHUB_STEP_SUMMARY: "",
      },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, out: err.stdout ?? "" };
  }
}

before(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(apiStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify(apiStatus === 200 ? [{ event: "labeled", label: { name: "invariante-aprovado" }, actor: { login: labeler }, created_at: "t" }] : {}));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
  repo = mkdtempSync(join(tmpdir(), "guarda-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write({ ".github/CODEOWNERS": CODEOWNERS, "tests/invariants/a.test.ts": 'test("a", () => {});\ntest("b", () => {});\n' });
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "pr");
  write({ "tests/invariants/a.test.ts": 'test("a", () => {});\n' });
});

after(() => {
  server.close();
  rmSync(repo, { recursive: true, force: true });
});

test("guarda: mudança nos invariantes sem rótulo reprova", async () => {
  const r = await guard([]);
  assert.equal(r.code, 1);
  assert.match(r.out, /sem um rótulo `invariante-aprovado` válido/);
});

test("guarda: rótulo aplicado pelo dono do CODEOWNERS aprova", async () => {
  labeler = "Dono";
  const r = await guard(["invariante-aprovado"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /aplicado por @Dono/);
});

test("guarda: rótulo aplicado por quem não é dono reprova", async () => {
  labeler = "agente-bot";
  const r = await guard(["invariante-aprovado"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /aplicado por @agente-bot, que não é dono/);
  assert.match(r.out, /caiu de 2 para 1/);
  labeler = "dono";
});

test("guarda: no CI, sem conseguir conferir quem aplicou o rótulo, reprova", async () => {
  apiStatus = 500;
  const r = await guard(["invariante-aprovado"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /Não deu para conferir/);
  apiStatus = 200;
});
