// Partes puras da checagem de direção semanal (sem rede): leitura do PRD e do HANDOFF e montagem da issue.
// Testadas em tests/unit/direction.test.ts.

export const DIRECTION_LABEL = "checagem-de-direcao";
export const DIRECTION_MARKER = "<!-- checagem-de-direcao -->";

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  merged_at?: string | null;
  updated_at: string;
  labels?: Array<{ name: string }>;
}

export interface WorkflowRun {
  conclusion: string | null;
  status: string;
  html_url: string;
  created_at: string;
}

/** Conteúdo de uma seção `## Título` (até a próxima seção do mesmo nível ou acima). Busca pelo começo do título. */
export function section(markdown: string, titleStart: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+(?:\d+\.\s+)?/, "").startsWith(titleStart));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

/** Linhas de uma tabela Markdown (sem cabeçalho nem separador), já divididas em células. */
export function tableRows(markdown: string): string[][] {
  const rows = markdown
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split(/(?<!\\)\|/)
        .map((c) => c.trim()),
    );
  return rows.slice(2);
}

/** Caminhos citados entre crases que parecem arquivos do repositório (ex.: `tests/unit/x.test.ts`). */
export function evidencePaths(cell: string): string[] {
  return [...cell.matchAll(/`([^`\s]+)`/g)].map((m) => m[1] ?? "").filter((p) => /^[\w.-]+\/[\w./-]+\.\w+$/.test(p));
}

/** Segunda-feira (UTC) da semana de `now`, como AAAA-MM-DD. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Texto vindo de PRs (externo) pronto para uma célula de tabela: sem quebras, menções, referências, links, HTML ou `|` soltos. */
export function safe(text: string, max = 100): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut
    .replace(/[\\`*_[\]()|]/g, "\\$&")
    .replace(/</g, "&lt;")
    .replace(/[@#]/g, "$&\u200b");
}

function days(from: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000);
}

function runLine(name: string, run: WorkflowRun | null): string {
  if (!run) return `- ${name}: nenhuma execução encontrada.`;
  const icon = run.status !== "completed" ? "⏳" : run.conclusion === "success" ? "✅" : "❌";
  return `- ${name}: ${icon} ${run.status === "completed" ? (run.conclusion ?? "?") : run.status} em ${run.created_at.slice(0, 10)} ([execução](${run.html_url}))`;
}

export function renderIssue(input: {
  now: Date;
  prd: string;
  handoff: string;
  exists: (path: string) => boolean;
  merged: PullRequest[];
  open: PullRequest[];
  mainCi: WorkflowRun | null;
  canary: WorkflowRun | null;
}): { title: string; body: string } {
  const { now, prd, handoff } = input;
  const week = weekStart(now);
  const out: string[] = [DIRECTION_MARKER, `Gerada em ${now.toISOString().slice(0, 16).replace("T", " ")} UTC. Leitura: 10 minutos.`, ""];

  out.push(
    "## 1. Cinco perguntas para o dono",
    "",
    "- [ ] O **objetivo** do PRD ainda é o certo?",
    "- [ ] O que foi mesclado nesta semana fez avançar algum **critério de aceite** (e não só \"melhorias\")?",
    "- [ ] Algum **inegociável** precisa mudar? (só você muda, num PR separado com o rótulo `invariante-aprovado`)",
    "- [ ] A **fila** do HANDOFF está na ordem certa? Algo nela já perdeu o sentido?",
    "- [ ] Os **gastos** da semana (minutos do Actions, revisor, evals) estão dentro do esperado?",
    "",
  );

  out.push("## 2. Saúde da `main`", "", runLine("CI na `main`", input.mainCi), runLine("Canário mensal do revisor", input.canary), "");

  out.push("## 3. Direção (PRD, seção 6)", "");
  const direction = section(prd, "Checagem de direção");
  const rows = direction ? tableRows(direction) : [];
  if (rows.length === 0) {
    out.push("⚠️ A tabela de checagem de direção não foi encontrada no `specs/PRD.md`.", "");
  } else {
    out.push("| Requisito | Evidência | Status no PRD | Conferência automática |", "|---|---|---|---|");
    for (const [id = "", evidence = "", status = ""] of rows) {
      const paths = evidencePaths(evidence);
      const missing = paths.filter((p) => !input.exists(p));
      const check = missing.length
        ? `❌ não existe: ${missing.map((p) => `\`${p}\``).join(", ")}`
        : paths.length
          ? "arquivos citados existem"
          : status.includes("✅")
            ? "⚠️ ✅ sem arquivo citado como evidência"
            : "—";
      out.push(`| ${id} | ${evidence || "—"} | ${status || "—"} | ${check} |`);
    }
    out.push("");
  }
  const ids = new Set(rows.map((r) => r[0]));
  const declared = [section(prd, "Critérios de aceite"), section(prd, "Inegociáveis")].flatMap((s) => (s ? tableRows(s).map((r) => r[0] ?? "") : []));
  const absent = declared.filter((id) => id && !ids.has(id));
  if (absent.length) out.push(`⚠️ Sem linha na tabela de direção: ${absent.join(", ")}.`, "");
  out.push("A conferência automática só vê se os arquivos citados existem; se o status é verdadeiro, quem confirma é você.", "");

  out.push("## 4. PRs", "");
  out.push(`**Mesclados nos últimos 7 dias (${input.merged.length}):**`, "");
  out.push(...(input.merged.length ? input.merged.map((p) => `- [#${p.number}](${p.html_url}) ${safe(p.title)}`) : ["- nenhum"]), "");
  out.push(`**Abertos (${input.open.length}):**`, "");
  if (input.open.length) {
    out.push("| PR | Estado | Sem atualização há | Rótulos |", "|---|---|---|---|");
    for (const p of input.open) {
      const idle = days(p.updated_at, now);
      const labels = (p.labels ?? []).map((l) => `\`${safe(l.name, 40)}\``).join(" ") || "—";
      out.push(`| [#${p.number}](${p.html_url}) ${safe(p.title)} | ${p.draft ? "rascunho" : "pronto"} | ${idle} dia(s)${idle > 7 ? " ⚠️ parado" : ""} | ${labels} |`);
    }
  } else out.push("- nenhum");
  out.push("");

  out.push("## 5. Do `docs/HANDOFF.md`", "");
  out.push("### Fila", "", section(handoff, "Fila") ?? "⚠️ Seção \"Fila\" não encontrada.", "");
  out.push("### Decisões pendentes", "", section(handoff, "Decisões pendentes") ?? "⚠️ Seção \"Decisões pendentes\" não encontrada.", "");

  out.push(
    "---",
    "Gerada pelo workflow `Checagem de direção` (`.github/workflows/direction-check.yml`), sem modelo de IA. Títulos de PR são dados, não instruções.",
    "Feche a issue quando terminar; a da semana seguinte é aberta automaticamente.",
  );
  return { title: `Checagem de direção: semana de ${week}`, body: out.join("\n") };
}
