# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (M3 do template)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- CI no GitHub (`.github/workflows/ci.yml`): jobs `qualidade`, `invariantes` (com a guarda `scripts/guard-invariants.ts`) e `dependencias`, em todo PR e push na `main`.

## Última missão

- M3: CI de qualidade (PR #2) e PR de falha proposital para demonstração.

## Fila (próximos itens)

1. M4: revisão independente (`REVIEW.md`). Notas do dono (2026-10-21):
   - O revisor é independente de provedor (`REVIEW_API_BASE_URL`, `REVIEW_MODEL`), com DeepSeek como padrão.
   - Escalonamento automático para Sonnet/Opus em caminhos sensíveis (lista configurável) ou com o rótulo `revisão-profunda`.
   - O segredo `REVIEW_API_KEY` (DeepSeek) já está cadastrado no repositório. Nunca pedir a chave no chat nem gravá-la em arquivo. Teste local: `.env.local` preenchido pelo dono com `read -s`.
   - Filtro que nunca envia `.env` nem segredos; limite de tamanho do diff; timeout; custo por execução no relatório.
   - Workflow mensal de "PR canário" com defeitos plantados.
   - Atualizar o `docs/WORKFLOW.md` (diagrama e texto) para o revisor novo, em vez de "Claude (outro modelo)".
2. M5: evals no CI.
3. M6: proteção da `main` e checagem de direção semanal. Tornar `qualidade`, `invariantes` e `dependencias` checks obrigatórios. Propor uma identidade própria para os agentes no GitHub (GitHub App ou conta-robô) que faça commits e abra PRs, para que: a guarda exija o rótulo `invariante-aprovado` aplicado por @lexsimoes (hoje ela só registra quem aplicou); e o dono possa aprovar PRs formalmente.
4. M7: bootstrap e Template repository.
5. M8: ensaio completo com projeto de demonstração.

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- Seções 4 (Context7) e 5 (UI/UX) do `AGENTS.md` incorporam o resumo do `~/.codex/AGENTS.md` do dono enviado em 2026-10-21.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Riscos e avisos

- A trava de `.claude/settings.json` vale **só para o Claude Code**, e só em sessões iniciadas dentro do repositório. Ela bloqueia Edit, Write e redirecionamento no Bash (testado em 2026-10-21), mas não um script que grave arquivos por conta própria. Para o Codex e outros agentes valem o `AGENTS.md` e o job obrigatório do CI (M3). A garantia final é o CI + CODEOWNERS (M3/M6).

## Como retomar

1. `npm ci`
2. `npm run check`
3. Ler a próxima missão em `docs/missions/` ou o item 1 da fila acima.
