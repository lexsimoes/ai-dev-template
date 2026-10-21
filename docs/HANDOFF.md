# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (M4 do template)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- CI no GitHub (`.github/workflows/ci.yml`): jobs `qualidade`, `invariantes` (com a guarda `scripts/guard-invariants.ts`) e `dependencias`, em todo PR e push na `main`.
- Revisor independente (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek por padrão, Sonnet em caminho sensível, Opus com o rótulo `revisão-profunda`. Canário mensal (`.github/workflows/review-canary.yml`).

## Última missão

- M4b: economia no revisor (PR em rascunho, revisão única ao ficar pronto, `revisar-de-novo` incremental, PRs triviais, prompt estável para cache).

## Fila (próximos itens)

1. M5: evals no CI.
2. M6: proteção da `main` e checagem de direção semanal. Tornar `qualidade`, `invariantes`, `dependencias` e `revisao` checks obrigatórios. Propor uma identidade própria para os agentes no GitHub (GitHub App ou conta-robô) que faça commits e abra PRs, para que: a guarda exija o rótulo `invariante-aprovado` aplicado por @lexsimoes (hoje ela só registra quem aplicou); e o dono possa aprovar PRs formalmente.
3. M7: bootstrap e Template repository.
4. M8: ensaio completo com projeto de demonstração.

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- Seções 4 (Context7) e 5 (UI/UX) do `AGENTS.md` incorporam o resumo do `~/.codex/AGENTS.md` do dono enviado em 2026-10-21.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Riscos e avisos

- O estado do revisor (commit revisado + achados em aberto) fica num comentário HTML do robô. Quem tem permissão de escrita no repositório pode editar esse comentário; a edição aparece no histórico do comentário. O `AGENTS.md` proíbe agentes de editá-lo.
- Pushes depois da revisão não são revisados pelo modelo (decisão de economia). O check só fica vermelho se houver segredo, caminho sensível ou bloqueante pendente; o dono vê no comentário quais commits não foram revisados.

- Segredos em workflows `pull_request`: qualquer pessoa com permissão de push pode, num PR da mesma origem, alterar um workflow e ler `REVIEW_API_KEY`. Mitigação atual: só o dono e os agentes dele têm push; `.github/` é CODEOWNERS. Avaliar no M6 (ambiente com aprovação para segredos).
- `REVIEW_DEEP_API_KEY` (Anthropic) ainda não cadastrado: sem ele, os níveis `sensivel` e `profunda` caem para o padrão (o relatório avisa).

- A trava de `.claude/settings.json` vale **só para o Claude Code**, e só em sessões iniciadas dentro do repositório. Ela bloqueia Edit, Write e redirecionamento no Bash (testado em 2026-10-21), mas não um script que grave arquivos por conta própria. Para o Codex e outros agentes valem o `AGENTS.md` e o job obrigatório do CI (M3). A garantia final é o CI + CODEOWNERS (M3/M6).

## Como retomar

1. `npm ci`
2. `npm run check`
3. Ler a próxima missão em `docs/missions/` ou o item 1 da fila acima.
