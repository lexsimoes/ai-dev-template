# HANDOFF: estado atual do projeto

> Este arquivo é a "passagem de turno": qualquer agente (ou você, daqui a um mês) lê aqui primeiro para saber onde as coisas estão.
> O agente atualiza ao fim de **cada** missão.

**Atualizado em:** 2026-10-21 · **Por:** agente (M2 do template)

## Estado atual

- Esqueleto do template criado: regras para agentes (`AGENTS.md`), PRD modelo, modelo de missão, invariantes de exemplo, evals de exemplo, modelo de PR.
- App de demonstração: `src/pricing.ts` (cupom) e `src/ai/classify-message.ts` (classificador com LLM).
- `npm run check` passa localmente; `npm run eval:mock` passa (mock não mede qualidade real).
- Ainda **não** existe CI no GitHub (vem no M3).

## Última missão

- M2: esqueleto do template.

## Fila (próximos itens)

1. M3: CI de qualidade (lint, tipos, testes, invariantes como job obrigatório, auditoria de dependências).
2. M4: revisão independente com Claude (`REVIEW.md`, `claude-code-action`).
3. M5: evals no CI.
4. M6: proteção da `main` e checagem de direção semanal.
5. M7: bootstrap e Template repository.
6. M8: ensaio completo com projeto de demonstração.

## Decisões pendentes (do dono)

- O `AGENTS.md` do template é a versão oficial do método (decisão do dono, 2026-10-21).
- `~/.codex/AGENTS.md` do dono (Context7 + preferências de UI/UX) ainda não recebido: a seção 5 (UI/UX) tem um marcador PENDENTE para o resumo dessas preferências.
- M7: gerar `~/.codex/AGENTS.md` e `~/.claude/CLAUDE.md` globais a partir do template, versionados num repositório de dotfiles; seções opcionais (`<!-- opcional:... -->`) ligadas pelo tipo de projeto.
- Modelo padrão do adaptador Anthropic: `claude-opus-5-5`. Trocar para um modelo mais barato nos evals é decisão do dono (ver `evals/README.md`, Custos).

## Riscos e avisos

- A trava de `.claude/settings.json` é de "melhor esforço": impede as ferramentas de edição do Claude Code, mas não um script que grave arquivos por conta própria. A trava que vale de verdade é o CI + CODEOWNERS (M3/M6).

## Como retomar

1. `npm ci`
2. `npm run check`
3. Ler a próxima missão em `docs/missions/` ou o item 1 da fila acima.
