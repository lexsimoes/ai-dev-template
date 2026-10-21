# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (roadmap after M6)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- Evals no CI com DeepSeek (`EVAL_API_KEY`), régua e golden set da `main`, comentário com custo.
- CI no GitHub (`.github/workflows/ci.yml`): jobs `qualidade`, `invariantes` (com a guarda `scripts/guard-invariants.ts`) e `dependencias`, em todo PR e push na `main`.
- Revisor independente (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek por padrão, Sonnet em caminho sensível, Opus com o rótulo `revisão-profunda`. Canário mensal e ao ficar pronto um PR que muda o revisor (`.github/workflows/review-canary.yml`).
- Proteção da `main`: regra `.github/rulesets/proteger-main.json` importada e ativa (5 checks obrigatórios, só do Actions; PR obrigatório; 0 aprovações).
- Checagem de direção semanal (`.github/workflows/direction-check.yml`, `scripts/direction/`): issue toda segunda-feira com o rótulo `checagem-de-direcao`.

## Última missão

- M6: proteção da `main` e checagem de direção semanal.
  - `revisao` e `evals` não são mais pulados em rótulos alheios nem em forks (um check obrigatório pulado conta como verde).
  - Guarda dos invariantes roda a versão da `main` e só aceita o rótulo aplicado por dono do CODEOWNERS.
  - Decisões do dono aplicadas: linha de base dos evals obrigatória; canário só quando o PR fica pronto (e no mensal).

## Fila (próximos itens)

Roadmap decided by the owner on 2026-10-21 (recorded here; not implemented yet). From now on the template is written in English; the agent talks to the owner in the configured conversation language (pt-BR).

1. **M-EN (now): migrate the template to English.** One translation-only PR: AGENTS.md, CLAUDE.md, docs, script messages, workflow and check names, labels, weekly issue, reviewer prompts and output, canary. Zero behavior change. New names: checks `quality`, `invariants`, `dependencies`, `review`, `evals`; labels `invariant-approved`, `eval-approved`, `deep-review`, `re-review`; ruleset `protect-main`.
2. **M7 (engine):**
   - Copier template asking: project name, GitHub owner (becomes CODEOWNERS and the invariant guard's approver; no hardcoded `@lexsimoes`), conversation language, reviewer provider, optional sections.
   - No-AI-key mode: quality, invariants and dependencies run; the reviewer is off with a notice and does not block.
   - `copier update` path to bring improvements to projects already created.
   - MIT license and a "Getting started" README.
   - Weekly workflow that exports GitHub traffic data (kept by GitHub for only 14 days) to a versioned file.
   - The owner's dotfiles and global CLAUDE.md stay out of the template, in a separate private repository.
   - Restore `maxDiffChars` in `.github/review.json` to 150000. It was raised to 450000 only so that the M-EN translation PR (about 410,000 characters of diff) can be reviewed; the reviewer reads this value from `main`, so it has to be raised before that PR is marked ready.
3. **M7b (entry point): Claude Code plugin** (marketplace in this repository):
   - `/new-project`: empty folder → discovery; existing code → audit. Talks with the person and passes the answers to Copier (`--data`), with no terminal prompts.
   - Automatic setup: labels via `gh`; protection ruleset applied via the API (first check whether the plan allows it on a private repository, and warn); keys registered by the person with `gh secret set NAME` in their own terminal, NEVER through the conversation, with a spending-limit reminder.
   - `/check-setup`: lists what is missing (keys, active ruleset, labels, green CI) and how to fix it.
   - Bridge files for implementers that do not read AGENTS.md natively. Claude Code is the entry point; Codex, Cursor, Antigravity and others are implementers only and just need AGENTS.md.
4. **M7c (discovery and audit):**
   - Discovery: product questions → short PRD with verifiable criteria, non-negotiables with their first tests, skills and MCPs chosen from the answers, and "test before choosing" (throwaway prototype when an idea or model is risky).
   - Audit: map stack, tests and sensitive areas; infer the PRD from the code and ask the owner to confirm; propose non-negotiables from what already exists; turn CI on in observation mode first (non-blocking) and make each check required once it is green.
5. **M7d (tester):**
   - Playwright test agents (planner/generator/healer) write 3 to 8 tests of the critical flows from the PRD; they become a required check.
   - They run only in an isolated environment (local, or a preview with test data), with AI calls replaced by a fake provider. AI quality stays the job of the evals.
   - The healer may update selectors; changing what a test asserts requires the owner's `test-approved` label.
   - A flaky test goes to quarantine with an issue opened, never silently disabled.
   - Exploratory session only on request, opening issues with screenshots and reproduction steps; each confirmed bug becomes a new test.
   - Breaker and newcomer modes only on request.
6. **M8 (rehearsal):** a new project from scratch; an audit of an existing owner project (GoAgentic, read-only, on a branch); someone (or the newcomer agent) installing from the README alone; the reviewer comparisons already planned; a PR that weakens an invariant and is blocked; a real check that an unrelated label does not turn a red required check green (done on 2026-10-21 in PR #8 with a green check; repeat with a red one).

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- Seções 4 (Context7) e 5 (UI/UX) do `AGENTS.md` incorporam o resumo do `~/.codex/AGENTS.md` do dono enviado em 2026-10-21.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- `tests/invariants/README.md`, linha "Dono obrigatório": diz que a proteção da `main` exige a aprovação do dono, o que não vale na opção A (0 aprovações). A pasta é protegida: só o dono atualiza, com o rótulo `invariante-aprovado`.
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Decisões tomadas (dono, 2026-10-21)

- Agent identity: option A (agents keep using the owner's account).
- Language: the template is 100% English from now on; the conversation language is a setting (currently pt-BR), not the language of the files.
- Entry point: Claude Code. Codex, Cursor, Antigravity and others are implementers only and need only AGENTS.md.
- `"Bash(gh pr merge:*)"` added to the `deny` list of `.claude/settings.json` by the owner (commit `dd37036`).
- Ruleset `proteger-main` imported and active; a red required check blocks the merge (verified in PR #8: `mergeable_state` = `blocked`).

- Linha de base dos evals obrigatória: se a rodada da `main` falhar, o check `evals` fica vermelho.
- Canário do revisor em PRs só quando o PR fica pronto (e no mensal).

- Revisor padrão: `deepseek-v4-pro` (sem trocar para flash).
- `afterReviewPush: "exigir-nova-revisao"` desde já: push depois da revisão fica vermelho até `revisar-de-novo`.
- `trivial.mode: "leve"`.
- Modo `@claude` em comentários (`claude-code-action`): descartado por agora.

## Riscos e avisos

- O estado do revisor (commit revisado + achados em aberto) fica num comentário HTML do robô. Quem tem permissão de escrita no repositório pode editar esse comentário; a edição aparece no histórico do comentário. O `AGENTS.md` proíbe agentes de editá-lo.
- Pushes depois da revisão não são revisados pelo modelo (decisão de economia). Com `exigir-nova-revisao`, o check fica vermelho até o rótulo `revisar-de-novo`, então nenhum commit chega ao merge sem revisão.

- Segredos em workflows `pull_request`: qualquer pessoa com permissão de push pode, num PR da mesma origem, alterar um workflow e ler `REVIEW_API_KEY`. Mitigação: só o dono e os agentes dele têm push; o revisor trata `.github/` como sensível; cada chave tem limite de gasto no provedor (confirme o da `REVIEW_API_KEY` e da `REVIEW_DEEP_API_KEY`). Ambiente com aprovação manual para segredos foi avaliado no M6 e não recomendado para dev solo (um clique por revisão e por eval).
- `REVIEW_DEEP_API_KEY` (Anthropic) está cadastrado: as revisões do PR #6 rodaram no nível `sensivel` com `claude-sonnet-5-5`. Sem ele, os níveis `sensivel` e `profunda` caem para o padrão (o relatório avisa).
- Rótulo `invariante-aprovado` não fica preso a um commit: depois que o dono aplica, pushes seguintes que mexam em `tests/invariants/` continuam aprovados enquanto o rótulo estiver no PR. Na opção A (agente = dono) isso não muda nada; na opção B, remover o rótulo a cada push que toque a pasta seria o próximo passo (revisão de segurança do M6, confiança 7/10).
- A proteção do golden set e a régua dos evals rodam no `evals/run.ts` **do PR** (que testa o código do PR). Um PR que altere esse arquivo pode afrouxá-las; o revisor trata `evals/` como caminho sensível. Rodar o executor da `main` contra o código do PR é melhoria possível (anterior ao M6).
- `isAncestor` (revisor): o ramo "falha real do git → erro" não tem teste; o de "commit apagado por force-push → false" tem.

- A trava de `.claude/settings.json` vale **só para o Claude Code**, e só em sessões iniciadas dentro do repositório. Ela bloqueia Edit, Write e redirecionamento no Bash (testado em 2026-10-21), mas não um script que grave arquivos por conta própria. Para o Codex e outros agentes valem o `AGENTS.md` e o job obrigatório do CI (M3). A garantia final é o CI com os checks obrigatórios da regra de proteção (M6).

## Como retomar

1. `npm ci`
2. `npm run check`
3. Ler a próxima missão em `docs/missions/` ou o item 1 da fila acima.
