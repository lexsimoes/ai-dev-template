# ai-dev-template

A repository template for developing with AI agents. The agent implements, another model reviews, the bots verify everything and **you decide and approve**.

> Start with [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## What comes ready

| Piece | File | What for |
|---|---|---|
| Rules for agents | [`AGENTS.md`](AGENTS.md) · [`CLAUDE.md`](CLAUDE.md) | How any agent must work here |
| Skills | [`docs/SKILLS.md`](docs/SKILLS.md) | Which skill to use per task, where it comes from and how to install it |
| Requirements | [`specs/PRD.md`](specs/PRD.md) | Goal, acceptance criteria, **non-negotiables**, direction check |
| Missions | [`docs/missions/`](docs/missions/) | A work order for each task |
| Handoff | [`docs/HANDOFF.md`](docs/HANDOFF.md) | Current state and queue |
| Non-negotiables | [`tests/invariants/`](tests/invariants/) | Tests no agent may touch |
| Evals | [`evals/`](evals/) | Golden set + evaluator for functions with an LLM |
| PR template | [`.github/pull_request_template.md`](.github/pull_request_template.md) | Requirement → evidence → status |

## Quick start

```bash
npm ci
npm run check       # lint, types, tests, invariants
npm run eval:mock   # evals at no cost
```

Requires Node.js 22.18 or newer (TypeScript runs directly on Node, with no build step).

## Demo app

So the examples have something real to test, the template ships a minimal app:
- `src/pricing.ts`: applies a discount coupon (protected by INV-001);
- `src/ai/classify-message.ts`: classifies customer messages with an LLM (protected by INV-002 and measured by evals).

When starting a new project, replace these examples with your own (`scripts/bootstrap` will help, M7).
