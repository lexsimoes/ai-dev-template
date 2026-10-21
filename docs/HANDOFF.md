# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (M5 do template)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- Evals no CI com DeepSeek (`EVAL_API_KEY`), régua e golden set da `main`, comentário com custo.
- CI no GitHub (`.github/workflows/ci.yml`): jobs `qualidade`, `invariantes` (com a guarda `scripts/guard-invariants.ts`) e `dependencias`, em todo PR e push na `main`.
- Revisor independente (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek por padrão, Sonnet em caminho sensível, Opus com o rótulo `revisão-profunda`. Canário mensal (`.github/workflows/review-canary.yml`).

## Última missão

- M5: evals no CI (`.github/workflows/evals.yml`), adaptador `openai-compatible` no app, canário do revisor com casos incremental e leve.
  - Golden set protegido pela lista de suites da `main` (remover a suite ou trocar o arquivo exige `eval-aprovado`).
  - Primeira rodada real (PR #6): 10/10 casos, 10 chamadas, ≈ US$ 0,004.

## Fila (próximos itens)

1. M6: proteção da `main` e checagem de direção semanal. Tornar `qualidade`, `invariantes`, `dependencias`, `revisao` e `evals` checks obrigatórios. Propor uma identidade própria para os agentes no GitHub (GitHub App ou conta-robô) que faça commits e abra PRs, para que: a guarda exija o rótulo `invariante-aprovado` aplicado por @lexsimoes (hoje ela só registra quem aplicou); e o dono possa aprovar PRs formalmente.
2. M7: bootstrap e Template repository.
3. M8: ensaio completo com projeto de demonstração.

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- Seções 4 (Context7) e 5 (UI/UX) do `AGENTS.md` incorporam o resumo do `~/.codex/AGENTS.md` do dono enviado em 2026-10-21.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- Linha de base dos evals: se a rodada da `main` falhar, o check passa com "sem comparação" (necessário até a `main` ter o adaptador `openai-compatible`). Depois do merge do M5, exigir a linha de base é decisão do dono.
- Canário do revisor: o filtro de caminhos do `pull_request` olha o diff inteiro do PR, então todo push num PR que toca o revisor roda os 3 casos de novo (≈ US$ 0,08 por push). Restringir a `ready_for_review` e ao rótulo é decisão do dono.
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Decisões tomadas (dono, 2026-10-21)

- Revisor padrão: `deepseek-v4-pro` (sem trocar para flash).
- `afterReviewPush: "exigir-nova-revisao"` desde já: push depois da revisão fica vermelho até `revisar-de-novo`.
- `trivial.mode: "leve"`.
- Modo `@claude` em comentários (`claude-code-action`): descartado por agora.

## Riscos e avisos

- O estado do revisor (commit revisado + achados em aberto) fica num comentário HTML do robô. Quem tem permissão de escrita no repositório pode editar esse comentário; a edição aparece no histórico do comentário. O `AGENTS.md` proíbe agentes de editá-lo.
- Pushes depois da revisão não são revisados pelo modelo (decisão de economia). Com `exigir-nova-revisao`, o check fica vermelho até o rótulo `revisar-de-novo`, então nenhum commit chega ao merge sem revisão.

- Segredos em workflows `pull_request`: qualquer pessoa com permissão de push pode, num PR da mesma origem, alterar um workflow e ler `REVIEW_API_KEY`. Mitigação atual: só o dono e os agentes dele têm push; `.github/` é CODEOWNERS. Avaliar no M6 (ambiente com aprovação para segredos).
- `REVIEW_DEEP_API_KEY` (Anthropic) está cadastrado: as revisões do PR #6 rodaram no nível `sensivel` com `claude-sonnet-5-5`. Sem ele, os níveis `sensivel` e `profunda` caem para o padrão (o relatório avisa).
- `isAncestor` (revisor): o ramo "falha real do git → erro" não tem teste; o de "commit apagado por force-push → false" tem.

- A trava de `.claude/settings.json` vale **só para o Claude Code**, e só em sessões iniciadas dentro do repositório. Ela bloqueia Edit, Write e redirecionamento no Bash (testado em 2026-10-21), mas não um script que grave arquivos por conta própria. Para o Codex e outros agentes valem o `AGENTS.md` e o job obrigatório do CI (M3). A garantia final é o CI + CODEOWNERS (M3/M6).

## Como retomar

1. `npm ci`
2. `npm run check`
3. Ler a próxima missão em `docs/missions/` ou o item 1 da fila acima.
