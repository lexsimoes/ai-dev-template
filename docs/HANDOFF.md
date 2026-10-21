# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (M6 do template)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- Evals no CI com DeepSeek (`EVAL_API_KEY`), régua e golden set da `main`, comentário com custo.
- CI no GitHub (`.github/workflows/ci.yml`): jobs `qualidade`, `invariantes` (com a guarda `scripts/guard-invariants.ts`) e `dependencias`, em todo PR e push na `main`.
- Revisor independente (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek por padrão, Sonnet em caminho sensível, Opus com o rótulo `revisão-profunda`. Canário mensal e ao ficar pronto um PR que muda o revisor (`.github/workflows/review-canary.yml`).
- Proteção da `main`: regra pronta em `.github/rulesets/proteger-main.json` (5 checks obrigatórios, só do Actions; PR obrigatório; 0 aprovações). **Só vale depois que o dono importar** (passos em `docs/WORKFLOW.md`).
- Checagem de direção semanal (`.github/workflows/direction-check.yml`, `scripts/direction/`): issue toda segunda-feira com o rótulo `checagem-de-direcao`.

## Última missão

- M6: proteção da `main` e checagem de direção semanal.
  - `revisao` e `evals` não são mais pulados em rótulos alheios nem em forks (um check obrigatório pulado conta como verde).
  - Guarda dos invariantes roda a versão da `main` e só aceita o rótulo aplicado por dono do CODEOWNERS.
  - Decisões do dono aplicadas: linha de base dos evals obrigatória; canário só quando o PR fica pronto (e no mensal).

## Fila (próximos itens)

1. M7: bootstrap e Template repository.
2. M8: ensaio completo com projeto de demonstração (incluir: PR que enfraquece um invariante e é bloqueado; conferir na prática que um rótulo alheio não deixa verde um check obrigatório vermelho).

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- Seções 4 (Context7) e 5 (UI/UX) do `AGENTS.md` incorporam o resumo do `~/.codex/AGENTS.md` do dono enviado em 2026-10-21.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- Identidade dos agentes: opção A (sua conta, atual) recomendada agora; opção B (conta-robô) quando houver agentes locais no dia a dia (comparação em `docs/WORKFLOW.md`).
- `tests/invariants/README.md`, linha "Dono obrigatório": diz que a proteção da `main` exige a aprovação do dono, o que não vale na opção A (0 aprovações). A pasta é protegida: só o dono atualiza, com o rótulo `invariante-aprovado`.
- Bloquear `gh pr merge` no Claude Code: acrescentar `"Bash(gh pr merge:*)"` ao `deny` de `.claude/settings.json` (arquivo protegido contra edição do agente).
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Decisões tomadas (dono, 2026-10-21)

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
