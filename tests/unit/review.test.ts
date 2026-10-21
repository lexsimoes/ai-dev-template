import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REPORT_MARKER,
  estimateCost,
  filterFiles,
  globToRegExp,
  parseReview,
  redactSecrets,
  renderReport,
  selectTier,
  splitDiff,
} from "../../scripts/review/lib.ts";
import type { ReviewConfig } from "../../scripts/review/lib.ts";

const config = JSON.parse(readFileSync(".github/review.json", "utf-8")) as ReviewConfig;

// Segredos falsos montados em tempo de execução: nada com cara de chave fica no código-fonte.
const fakeGithubToken = "gh" + "p_" + "A".repeat(36);
const fakeAssignment = `const api` + `Key = "${"z".repeat(20)}";`;

function fileDiff(path: string, added: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    "--- a/" + path,
    "+++ b/" + path,
    `@@ -10,2 +10,${added.length + 2} @@`,
    " contexto 1",
    ...added.map((l) => `+${l}`),
    " contexto 2",
  ].join("\n");
}

test("glob: ** cobre qualquer profundidade e * não atravessa pastas", () => {
  assert.ok(globToRegExp("**/*.pem").test("a/b/c.pem"));
  assert.ok(globToRegExp("**/*.pem").test("c.pem"));
  assert.ok(globToRegExp("src/*.ts").test("src/a.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/x/a.ts"));
  assert.ok(globToRegExp(".github/**").test(".github/workflows/ci.yml"));
});

test("filtro: .env nunca é enviado, .env.example é, lockfile fica de fora", () => {
  const files = splitDiff(
    [fileDiff(".env.local", ["X=1"]), fileDiff(".env.example", ["X="]), fileDiff("package-lock.json", ["{}"]), fileDiff("src/a.ts", ["x"])].join("\n"),
  );
  const result = filterFiles(files, config);
  assert.deepEqual(result.excluded, [".env.local"]);
  assert.deepEqual(result.ignored, ["package-lock.json"]);
  assert.deepEqual(result.included.map((f) => f.path), [".env.example", "src/a.ts"]);
});

test("segredos: são redigidos e localizados na linha certa do arquivo novo", () => {
  const [file] = splitDiff(fileDiff("src/a.ts", ["const ok = 1;", `const t = "${fakeGithubToken}";`, fakeAssignment]));
  assert.ok(file);
  const { file: clean, hits } = redactSecrets(file);
  assert.ok(!clean.text.includes(fakeGithubToken), "token vazou");
  assert.ok(!clean.text.includes("z".repeat(20)), "atribuição vazou");
  assert.deepEqual(hits.map((h) => [h.line, h.added]), [[12, true], [13, true]]);
});

test("nível: rótulo > caminho sensível > padrão", () => {
  assert.equal(selectTier(["README.md"], [], config).tier, "padrao");
  assert.equal(selectTier(["src/pricing.ts"], [], config).tier, "sensivel");
  assert.equal(selectTier(["src/user/auth-service.ts"], [], config).tier, "sensivel");
  assert.equal(selectTier(["README.md"], ["revisão-profunda"], config).tier, "profunda");
});

test("resposta: achados sem evidência ou de arquivo fora do diff são descartados", () => {
  const raw = JSON.stringify({
    resumo: "ok",
    achados: [
      { severidade: "sugestão", arquivo: "src/a.ts", linha: 3, titulo: "Nome", explicacao: "x", evidencia: "const a" },
      { severidade: "bloqueante", arquivo: "src/inventado.ts", linha: 1, titulo: "X", explicacao: "x", evidencia: "y" },
      { severidade: "importante", arquivo: "src/a.ts", linha: 2, titulo: "Sem evidência", explicacao: "x", evidencia: "" },
      { severidade: "bloqueante", arquivo: "PR", linha: null, titulo: "Verificado sem prova", explicacao: "x", evidencia: "✅" },
    ],
  });
  const review = parseReview("```json\n" + raw + "\n```", ["src/a.ts"], 20);
  assert.equal(review.descartados, 2);
  assert.deepEqual(review.achados.map((a) => [a.severidade, a.arquivo]), [["bloqueante", "PR"], ["sugestao", "src/a.ts"]]);
});

test("resposta: quebra de linha crua dentro de texto do JSON é tolerada", () => {
  const raw = '{"resumo": "linha 1\nlinha 2", "achados": [{"severidade": "importante", "arquivo": "src/a.ts", "linha": 1, "titulo": "T", "explicacao": "x", "evidencia": "if (a) {\n\treturn 0;\n}"}]}';
  const review = parseReview(raw, ["src/a.ts"], 20);
  assert.equal(review.resumo, "linha 1\nlinha 2");
  assert.equal(review.achados[0]?.evidencia, "if (a) {\n\treturn 0;\n}");
  assert.throws(() => parseReview('{"resumo": "x", "achados": [}', ["src/a.ts"], 20), "JSON quebrado de outro jeito continua sendo erro");
});

test("resposta: texto que não é JSON vira erro (nunca 'aprovado' por engano)", () => {
  assert.throws(() => parseReview("Tudo certo, pode aprovar!", ["src/a.ts"], 20));
  assert.throws(() => parseReview('{"aprovado": true}', ["src/a.ts"], 20));
});

test("relatório: marcador, contagem e custo", () => {
  const md = renderReport({
    tierName: "padrao",
    tier: config.tiers.padrao,
    reason: "nenhum caminho sensível",
    notes: [],
    review: { resumo: "r", achados: [], naoRevisado: [], descartados: 0 },
    secretFindings: [],
    excluded: [".env.local"],
    ignored: [],
    usage: { inputTokens: 10_000, outputTokens: 1_000 },
    durationMs: 1234,
    error: null,
  });
  assert.ok(md.startsWith(REPORT_MARKER));
  assert.match(md, /Nenhum achado bloqueante/);
  assert.match(md, /\.env\.local.*nunca enviado/);
  assert.match(md, /US\$ 0,0172/);
  assert.equal(estimateCost(config.tiers.padrao, { inputTokens: 1e6, outputTokens: 0 }), config.tiers.padrao.pricePerMTok.input);
});

test("canário: o segredo plantado é pego pelo detector antes do envio", () => {
  const diff = readFileSync("scripts/review/canary/canary.diff", "utf-8").replaceAll("{{SEGREDO_FALSO}}", "canario-" + "q".repeat(16));
  const files = splitDiff(diff);
  assert.equal(files.length, 5);
  const config_ts = files.find((f) => f.path === "src/config.ts");
  assert.ok(config_ts);
  const { hits } = redactSecrets(config_ts);
  assert.deepEqual(hits.map((h) => h.line), [2]);
});
