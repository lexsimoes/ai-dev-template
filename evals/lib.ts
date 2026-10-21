// Partes puras dos evals (sem rede): régua confiável, golden set protegido, custo e comentário.
// Testadas em tests/unit/evals-lib.test.ts.

import { matchesAny } from "../scripts/review/lib.ts";

export interface GoldenCase {
  id: string;
  input: string;
  expected: { category?: string };
  mustNotContain?: string[];
  rubric?: string;
  tags?: string[];
}

export interface Suite {
  name: string;
  golden: string;
  target: string;
  thresholds: { accuracy: number; rulePassRate: number; judgeAverage?: number };
  maxDropFromBaseline: number;
}

export interface EvalConfig {
  maxCalls: number;
  /** Caminhos que, quando mudam num PR, fazem os evals rodarem no CI. */
  aiPaths: string[];
  /** Preço por milhão de tokens, por modelo (para a estimativa de custo). */
  pricing: Record<string, { input: number; output: number }>;
  suites: Suite[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function touchesAi(changedPaths: string[], config: Pick<EvalConfig, "aiPaths">): string[] {
  return changedPaths.filter((p) => matchesAny(p, config.aiPaths));
}

/**
 * Régua confiável: limites, queda máxima e teto de chamadas vêm da branch de destino.
 * Suites novas (que ainda não existem lá) usam os limites do PR.
 */
export function trustedConfig(pr: EvalConfig, base: EvalConfig | null): { config: EvalConfig; notes: string[] } {
  if (!base) return { config: pr, notes: ["Sem configuração na branch de destino: limites do próprio PR."] };
  const notes: string[] = [];
  const suites = pr.suites.map((s) => {
    const b = base.suites.find((x) => x.name === s.name);
    if (!b) {
      notes.push(`Suite nova \`${s.name}\`: limites do PR (não existem na branch de destino).`);
      return s;
    }
    if (JSON.stringify(b.thresholds) !== JSON.stringify(s.thresholds) || b.maxDropFromBaseline !== s.maxDropFromBaseline) {
      notes.push(`Suite \`${s.name}\`: o PR muda os limites; valem os da branch de destino.`);
    }
    return { ...s, thresholds: b.thresholds, maxDropFromBaseline: b.maxDropFromBaseline };
  });
  return { config: { ...pr, maxCalls: Math.min(pr.maxCalls, base.maxCalls), suites }, notes };
}

/** Casos do golden set que o PR apagou ou alterou (entrada, esperado ou regras). Acrescentar casos é livre. */
export function goldenChanges(base: GoldenCase[], pr: GoldenCase[]): { removed: string[]; changed: string[] } {
  const byId = new Map(pr.map((c) => [c.id, c]));
  const removed: string[] = [];
  const changed: string[] = [];
  for (const b of base) {
    const p = byId.get(b.id);
    if (!p) removed.push(b.id);
    else if (
      p.input !== b.input ||
      JSON.stringify(p.expected) !== JSON.stringify(b.expected) ||
      JSON.stringify(p.mustNotContain ?? []) !== JSON.stringify(b.mustNotContain ?? [])
    ) {
      changed.push(b.id);
    }
  }
  return { removed, changed };
}

/** Preço do modelo: nome exato ou o prefixo mais longo que bate (ex.: "deepseek-v4-pro"). */
export function priceFor(config: Pick<EvalConfig, "pricing">, model: string): { input: number; output: number } | null {
  const key = Object.keys(config.pricing)
    .filter((k) => model === k || model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? (config.pricing[key] ?? null) : null;
}

export function estimateCost(price: { input: number; output: number } | null, usage: TokenUsage): number | null {
  return price ? (usage.inputTokens / 1e6) * price.input + (usage.outputTokens / 1e6) * price.output : null;
}

export const EVAL_COMMENT_MARKER = "<!-- evals-automaticos -->";

export function renderEvalComment(input: {
  summaryTable: string;
  model: string;
  calls: number;
  maxCalls: number;
  usage: TokenUsage;
  cost: number | null;
  baselineNote: string;
  notes: string[];
  failed: boolean;
}): string {
  const cost = input.cost === null ? "sem preço configurado" : `≈ US$ ${input.cost.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  return [
    EVAL_COMMENT_MARKER,
    `## 🧪 Evals ${input.failed ? "❌ abaixo do limite ou em queda" : "✅ dentro dos limites"}`,
    "",
    input.summaryTable,
    "",
    `- Modelo: \`${input.model}\` · chamadas: ${input.calls} de no máximo ${input.maxCalls}`,
    `- Tokens: ${input.usage.inputTokens.toLocaleString("pt-BR")} de entrada + ${input.usage.outputTokens.toLocaleString("pt-BR")} de saída · custo ${cost} (estimativa pelo preço de tabela)`,
    `- Linha de base: ${input.baselineNote}`,
    ...input.notes.map((n) => `- ${n}`),
  ].join("\n");
}
