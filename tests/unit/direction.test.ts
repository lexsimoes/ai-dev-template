import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evidencePaths, renderIssue, safe, section, tableRows, weekStart } from "../../scripts/direction/lib.ts";

const PRD = `# PRD
## 3. Critérios de aceite
| ID | Critério | Como verificar |
|---|---|---|
| CA-01 | a | b |
| CA-02 | c | d |
## 4. Inegociáveis
| ID | Regra | Teste |
|---|---|---|
| INV-001 | e | f |
## 6. Checagem de direção
| Requisito | Evidência | Status |
|---|---|---|
| CA-01 | \`tests/unit/existe.test.ts\` passando | ✅ |
| INV-001 | \`tests/invariants/sumiu.test.ts\` | ✅ |
`;
const HANDOFF = "## Fila (próximos itens)\n\n1. M7\n\n## Decisões pendentes (do dono)\n\n- decidir X\n\n## Riscos\n- r\n";

test("PRD: seção pelo começo do título (com ou sem número) e linhas da tabela", () => {
  assert.equal(tableRows(section(PRD, "Critérios de aceite") ?? "").length, 2);
  assert.deepEqual(tableRows(section(PRD, "Checagem de direção") ?? "")[1], ["INV-001", "`tests/invariants/sumiu.test.ts`", "✅"]);
  assert.equal(section(HANDOFF, "Fila"), "1. M7");
  assert.equal(section(PRD, "Não existe"), null);
});

test("evidência: só caminhos de arquivo entre crases; comandos ficam de fora", () => {
  assert.deepEqual(evidencePaths("`tests/unit/a.test.ts` e `npm run eval` e `src/ai/llm.ts`"), ["tests/unit/a.test.ts", "src/ai/llm.ts"]);
});

test("semana começa na segunda-feira (UTC)", () => {
  assert.equal(weekStart(new Date("2026-10-21T06:00:00Z")), "2026-10-19");
  assert.equal(weekStart(new Date("2026-10-25T23:00:00Z")), "2026-10-19", "domingo ainda é da semana anterior");
  assert.equal(weekStart(new Date("2026-10-19T00:00:00Z")), "2026-10-19");
});

test("título de PR é dado: sem quebra de tabela, menção ou HTML", () => {
  assert.equal(safe("a | b\n@dono <script>"), "a \\| b @​dono &lt;script>");
  assert.equal(safe("[clique](http://x) #12 `c`"), "\\[clique\\]\\(http://x\\) #\u200b12 \\`c\\`", "sem link nem referência clicável");
  assert.equal(safe("x".repeat(200), 10).length, 10);
});

test("issue: evidência que sumiu, requisito sem linha, PR parado e seções do HANDOFF", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  const { title, body } = renderIssue({
    now,
    prd: PRD,
    handoff: HANDOFF,
    exists: (p) => p === "tests/unit/existe.test.ts",
    merged: [{ number: 6, title: "M5 | evals", html_url: "u6", updated_at: "2026-10-21T00:00:00Z", merged_at: "2026-10-21T00:00:00Z" }],
    open: [{ number: 7, title: "velho", html_url: "u7", draft: true, updated_at: "2026-10-01T00:00:00Z" }],
    mainCi: { conclusion: "failure", status: "completed", html_url: "r", created_at: "2026-10-20T00:00:00Z" },
    canary: null,
  });
  assert.equal(title, "Checagem de direção: semana de 2026-10-19");
  assert.match(body, /^<!-- checagem-de-direcao -->/);
  assert.match(body, /CI na `main`: ❌ failure/);
  assert.match(body, /\| CA-01 \| .* \| arquivos citados existem \|/);
  assert.match(body, /❌ não existe: `tests\/invariants\/sumiu\.test\.ts`/);
  assert.match(body, /Sem linha na tabela de direção: CA-02\./);
  assert.match(body, /\[#6\]\(u6\) M5 \\\| evals/);
  assert.match(body, /rascunho \| 20 dia\(s\) ⚠️ parado/);
  assert.match(body, /### Fila\n\n1\. M7/);
  assert.match(body, /### Decisões pendentes\n\n- decidir X/);
});

test("fluxo: abre a issue na primeira vez e atualiza a mesma (com comentário) nas seguintes", async () => {
  const calls: string[] = [];
  const issues: Array<{ number: number; body: string; user: { login: string }; html_url: string }> = [
    { number: 1, body: "<!-- checagem-de-direcao --> feita por uma pessoa", user: { login: "intruso" }, html_url: "i1" },
  ];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const url = req.url ?? "";
      calls.push(`${req.method} ${url.replace(/\?.*/, "")}`);
      let out: unknown = [];
      if (url.includes("/actions/workflows/")) out = { workflow_runs: [] };
      else if (req.method === "POST" && url.endsWith("/issues")) {
        const body = (JSON.parse(raw) as { body: string }).body;
        issues.push({ number: 2, body, user: { login: "github-actions[bot]" }, html_url: "i2" });
        out = { html_url: "i2" };
      } else if (url.startsWith("/repos/o/r/issues?")) out = issues;
      else if (req.method !== "GET") out = {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const env = { ...process.env, GITHUB_TOKEN: "falso", GITHUB_REPOSITORY: "o/r", GITHUB_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  try {
    const run = promisify(execFile);
    await run("node", ["scripts/direction/run.ts"], { env });
    assert.ok(calls.includes("POST /repos/o/r/issues"), "abre uma issue nova (a da pessoa não conta)");
    calls.length = 0;
    await run("node", ["scripts/direction/run.ts"], { env });
    assert.ok(calls.includes("PATCH /repos/o/r/issues/2"), "atualiza a issue do robô");
    assert.ok(calls.includes("POST /repos/o/r/issues/2/comments"), "comenta para notificar o dono");
    assert.ok(!calls.includes("POST /repos/o/r/issues"), "não abre outra");
  } finally {
    server.close();
  }
});
