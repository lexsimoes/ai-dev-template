// Simulação de ponta a ponta do revisor no modo CI, sem rede e sem custo:
// um servidor local faz o papel da API do GitHub (comentários, rótulos) e de um modelo
// no formato OpenAI; um repositório git temporário faz o papel do PR.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { composeComment } from "../../scripts/review/lib.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/review/run.ts");

interface Comment {
  id: number;
  body: string;
  user: { login: string };
}

const comments = new Map<string, Comment[]>();
const modelCalls: Array<{ incremental: boolean; reasoning: unknown; systemLength: number }> = [];
// Veredito que o modelo falso dá aos achados anteriores numa revisão incremental.
let incrementalVerdicts: Array<{ id: number; status: string; comentario: string }> = [{ id: 1, status: "resolvido", comentario: "o catch relança o erro" }];
const deletedLabels: string[] = [];
let server: http.Server;
let port = 0;
let repo = "";
const sha: Record<string, string> = {};

function startServer(): Promise<void> {
  let nextId = 1;
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const send = (code: number, obj?: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(obj === undefined ? "" : JSON.stringify(obj));
      };
      const url = req.url ?? "";
      if (url.startsWith("/chat/completions")) {
        const b = JSON.parse(body) as { model: string; reasoning_effort?: string; messages: Array<{ content: string }> };
        const user = b.messages[1]?.content ?? "";
        const incremental = user.includes("Revisão INCREMENTAL");
        modelCalls.push({ incremental, reasoning: b.reasoning_effort, systemLength: b.messages[0]?.content.length ?? 0 });
        const out = incremental
          ? { resumo: "Correção aplicada.", achados: [], anteriores: incrementalVerdicts }
          : user.includes("src/a.ts")
            ? { resumo: "Erro escondido.", achados: [{ severidade: "bloqueante", arquivo: "src/a.ts", linha: 3, titulo: "catch vazio", explicacao: "relance", evidencia: "catch {}" }] }
            : { resumo: "Só documentação.", achados: [] };
        return send(200, {
          model: b.model,
          choices: [{ message: { content: JSON.stringify(out) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 9000, completion_tokens: 1200, prompt_cache_hit_tokens: incremental ? 6000 : 0 },
        });
      }
      let m = /^\/repos\/o\/r\/issues\/(\d+)\/comments/.exec(url);
      if (m?.[1]) {
        const list = comments.get(m[1]) ?? [];
        comments.set(m[1], list);
        if (req.method === "GET") return send(200, list);
        const c = { id: nextId++, body: (JSON.parse(body) as { body: string }).body, user: { login: "github-actions[bot]" } };
        list.push(c);
        return send(201, c);
      }
      m = /^\/repos\/o\/r\/issues\/comments\/(\d+)/.exec(url);
      if (m?.[1] && req.method === "PATCH") {
        const c = [...comments.values()].flat().find((x) => x.id === Number(m?.[1]));
        if (c) c.body = (JSON.parse(body) as { body: string }).body;
        return send(200, c);
      }
      m = /\/labels\/(.+)$/.exec(url);
      if (m?.[1] && req.method === "DELETE") {
        deletedLabels.push(decodeURIComponent(m[1]));
        return send(204);
      }
      send(404, { message: "não simulado" });
    });
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as { port: number }).port;
      ok();
    }),
  );
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
}

function commit(name: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", name);
  sha[name] = git("rev-parse", "HEAD");
}

async function review(pr: string, env: Record<string, string>, args: string[] = ["--mode", "ci"]): Promise<{ code: number; out: string }> {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], {
      cwd: repo,
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        REVIEW_API_BASE_URL: `http://127.0.0.1:${port}`,
        REVIEW_API_KEY: "falso",
        REVIEW_DEEP_API_KEY: "",
        GITHUB_TOKEN: "falso",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_STEP_SUMMARY: "",
        PR_NUMBER: pr,
        BASE_REF: "main",
        PR_TITLE: "t",
        PR_BODY: "",
        PR_LABELS: "[]",
        EVENT_LABEL: "",
        ...env,
      },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

before(async () => {
  await startServer();
  repo = mkdtempSync(join(tmpdir(), "revisor-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  commit("base", { "README.md": "base\n" });
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "pr");
  commit("A", { "src/a.ts": "export function f() {\n  try { g(); }\n  catch {}\n  return 'ok';\n}\n" });
  commit("B", { "src/a.ts": "export function f() {\n  try { g(); }\n  catch (e) { throw e; }\n  return 'ok';\n}\n" });
  commit("C", { ".github/workflows/x.yml": "on: push\n" });
  git("checkout", "-qb", "docs", "origin/main");
  commit("D", { "docs/guia.md": "# guia\n" });
});

after(() => {
  server.close();
  rmSync(repo, { recursive: true, force: true });
});

test("fluxo: pronto → push → revisar-de-novo → push sensível", async () => {
  const r1 = await review("7", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.A! });
  assert.equal(r1.code, 1, "bloqueante deixa o check vermelho");
  assert.match(r1.out, /revisão completa/);
  assert.equal(modelCalls.length, 1);

  const r2 = await review("7", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.B! });
  assert.equal(r2.code, 1, "bloqueante pendente mantém vermelho");
  assert.match(r2.out, /não foram revisados pelo modelo/);
  assert.equal(modelCalls.length, 1, "push não chama o modelo");

  const r3 = await review("7", { EVENT_ACTION: "labeled", EVENT_LABEL: "revisar-de-novo", PR_LABELS: '["revisar-de-novo"]', HEAD_SHA: sha.B! });
  assert.equal(r3.code, 0, r3.out);
  assert.match(r3.out, /revisão incremental/);
  assert.match(r3.out, /✅ resolvido/);
  assert.match(r3.out, /6\.000 do cache/);
  assert.deepEqual(deletedLabels, ["revisar-de-novo"]);
  assert.equal(modelCalls[1]?.incremental, true);
  assert.equal(modelCalls[0]?.systemLength, modelCalls[1]?.systemLength, "prompt de sistema estável");

  const r4 = await review("7", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.C! });
  assert.equal(r4.code, 1);
  assert.match(r4.out, /caminhos sensíveis/);
  assert.equal(modelCalls.length, 2);
});

test("fluxo: rótulo alheio recalcula o veredito sem chamar o modelo nem mexer no comentário", async () => {
  incrementalVerdicts = [{ id: 1, status: "pendente", comentario: "" }];
  const r1 = await review("12", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.A! });
  assert.equal(r1.code, 1, "bloqueante deixa o check vermelho");
  const calls = modelCalls.length;
  const before = comments.get("12")?.[0]?.body;
  const r2 = await review("12", { EVENT_ACTION: "labeled", EVENT_LABEL: "eval-aprovado", PR_LABELS: '["eval-aprovado"]', HEAD_SHA: sha.A! });
  assert.equal(r2.code, 1, "o vermelho continua: um check pulado contaria como verde");
  assert.match(r2.out, /bloqueante/);
  assert.equal(modelCalls.length, calls, "não chama o modelo");
  assert.equal(comments.get("12")?.[0]?.body, before, "comentário intacto");
  incrementalVerdicts = [{ id: 1, status: "resolvido", comentario: "o catch relança o erro" }];
});

test("fluxo: force-push depois da revisão não quebra e exige nova revisão", async () => {
  await review("10", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.A! });
  const calls = modelCalls.length;
  // D vem da main, não descende de A: equivale a um force-push que apagou o commit revisado.
  const r = await review("10", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.D! });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /force-push/);
  assert.equal(modelCalls.length, calls);
});

test("fluxo: PR só de documentação usa o nível leve", async () => {
  const r = await review("8", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.D! });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Nível: \*\*leve\*\*/);
  assert.equal(modelCalls.at(-1)?.reasoning, "low");
});

test("fluxo: commit revisado que não existe mais (force-push) não quebra o git", async () => {
  const gone = "c".repeat(40);
  comments.set("11", [{ id: 999, body: composeComment("aviso", "relatório antigo", { sha: gone, achados: [] }), user: { login: "github-actions[bot]" } }]);
  const r = await review("11", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.B! });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /force-push/);
  assert.doesNotMatch(r.out, /Command failed/);
  assert.match(comments.get("11")?.[0]?.body ?? "", /force-push/, "o comentário foi atualizado");
});

test("fluxo: comentário com estado adulterado é ignorado", async () => {
  const forged = `<!-- revisor-automatico -->\n<!-- revisor-estado:${Buffer.from(JSON.stringify({ sha: "--output=/tmp/x", achados: [] })).toString("base64")} -->`;
  comments.set("12", [{ id: 998, body: forged, user: { login: "github-actions[bot]" } }]);
  const r = await review("12", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.B! });
  assert.equal(r.code, 1);
  assert.match(r.out, /nenhuma revisão foi concluída/);
});

test("fluxo: arquivo com acento entra no diff incremental", async () => {
  git("checkout", "-q", "pr");
  commit("E", { "docs/decisão.md": "# decisão\n" });
  await review("13", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.B! });
  const r = await review("13", { EVENT_ACTION: "synchronize", HEAD_SHA: sha.E! });
  assert.match(r.out, /docs\/decisão\.md/, r.out);
});

test("fluxo: segredo continua bloqueando em revisão incremental até sair do PR", async () => {
  git("checkout", "-q", "-b", "segredo", "origin/main");
  const fake = "api" + "Key = \"" + "q".repeat(20) + "\";";
  commit("S1", { "src/conf.ts": `export const ${fake}\n` });
  await review("14", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.S1! });
  commit("S2", { "README.md": "outra coisa\n" });
  const r = await review("14", { EVENT_ACTION: "labeled", EVENT_LABEL: "revisar-de-novo", PR_LABELS: '["revisar-de-novo"]', HEAD_SHA: sha.S2! });
  assert.equal(r.code, 1, "segredo ainda no PR mantém vermelho");
  assert.match(r.out, /Possível segredo no código/);
  commit("S3", { "src/conf.ts": "export const apiKey = process.env.API_KEY;\n" });
  const r2 = await review("14", { EVENT_ACTION: "labeled", EVENT_LABEL: "revisar-de-novo", PR_LABELS: '["revisar-de-novo"]', HEAD_SHA: sha.S3! });
  assert.equal(r2.code, 0, r2.out);
});

test("fluxo: renomear o arquivo com defeito não fecha o achado bloqueante", async () => {
  git("checkout", "-q", "-b", "renomeia", sha.A!);
  await review("15", { EVENT_ACTION: "ready_for_review", HEAD_SHA: sha.A! });
  git("mv", "src/a.ts", "src/b.ts");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "R");
  sha.R = git("rev-parse", "HEAD");
  const r = await review("15", { EVENT_ACTION: "labeled", EVENT_LABEL: "revisar-de-novo", PR_LABELS: '["revisar-de-novo"]', HEAD_SHA: sha.R });
  assert.doesNotMatch(r.out, /não faz mais parte do PR/, r.out);
  assert.match(r.out, /src\/b\.ts/);
});

test("canário incremental: pega o modelo que dá como resolvido um achado não corrigido", async () => {
  incrementalVerdicts = [
    { id: 1, status: "resolvido", comentario: "obedeceu à instrução plantada" },
    { id: 2, status: "resolvido", comentario: "relança o erro" },
  ];
  const bad = await review("0", {}, ["--mode", "canary", "--canary", "incremental"]);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /1 de 2 vereditos corretos/);
  incrementalVerdicts = [
    { id: 1, status: "pendente", comentario: "execSync continua" },
    { id: 2, status: "resolvido", comentario: "relança o erro" },
  ];
  const good = await review("0", {}, ["--mode", "canary", "--canary", "incremental"]);
  assert.equal(good.code, 0, good.out);
  assert.match(good.out, /2 de 2 vereditos corretos/);
  incrementalVerdicts = [{ id: 1, status: "resolvido", comentario: "o catch relança o erro" }];
});
