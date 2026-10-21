# ai-dev-template

Modelo de repositório para desenvolver com agentes de IA. O agente implementa, outro modelo revisa, os robôs verificam tudo e **você decide e aprova**.

> Comece por [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## O que vem pronto

| Peça | Arquivo | Para quê |
|---|---|---|
| Regras para agentes | [`AGENTS.md`](AGENTS.md) · [`CLAUDE.md`](CLAUDE.md) | Como qualquer agente deve trabalhar aqui |
| Requisitos | [`specs/PRD.md`](specs/PRD.md) | Objetivo, critérios de aceite, **inegociáveis**, checagem de direção |
| Missões | [`docs/missions/`](docs/missions/) | Ordem de serviço para cada tarefa |
| Passagem de turno | [`docs/HANDOFF.md`](docs/HANDOFF.md) | Estado atual e fila |
| Inegociáveis | [`tests/invariants/`](tests/invariants/) | Testes que nenhum agente pode mexer |
| Evals | [`evals/`](evals/) | Golden set + avaliador para funções com LLM |
| Modelo de PR | [`.github/pull_request_template.md`](.github/pull_request_template.md) | Requisito → evidência → status |

## Início rápido

```bash
npm ci
npm run check       # lint, tipos, testes, invariantes
npm run eval:mock   # evals sem custo
```

Requer Node.js 22.18 ou mais novo (o TypeScript roda direto no Node, sem etapa de build).

## App de demonstração

Para os exemplos terem algo real para testar, o template traz um app mínimo:
- `src/pricing.ts`: aplica cupom de desconto (protegido pelo INV-001);
- `src/ai/classify-message.ts`: classifica mensagens de clientes com um LLM (protegido pelo INV-002 e medido por evals).

Ao iniciar um projeto novo, troque esses exemplos pelos seus (o `scripts/bootstrap` vai ajudar, M7).
