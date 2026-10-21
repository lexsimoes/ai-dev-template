# PRD: [project name]

> PRD = product requirements document. Short on purpose: if it goes past 2 pages, cut.
> The parts marked **(example)** refer to the template's demo app (a store with coupons and a message classifier). Replace them with your project's own.

**Owner:** @[your-username] · **Last review:** [YYYY-MM-DD]

## 1. Goal

[One or two sentences: what problem the product solves and for whom.]

(example) Small online store that applies discount coupons correctly and sorts customer messages by topic, to reply faster.

## 2. Users

| Who | What they need |
|---|---|
| [user type] | [main need] |
| (example) Store customer | Pay the right price with a coupon |
| (example) Support agent | See the messages already sorted by topic |

## 3. Acceptance criteria

Each criterion must be **verifiable**: someone (or a test) can say yes or no.

| ID | Criterion | How to verify |
|---|---|---|
| CA-01 | [criterion] | [test / command / manual step] |
| CA-02 | (example) An X% coupon reduces the total by X%, rounded to the cent | `tests/unit/pricing.test.ts` |
| CA-03 | (example) Messages are classified as `troca`, `entrega`, `pagamento` or `outro` (exchange, delivery, payment or other) with ≥ 90% accuracy | `npm run eval` (suite `classify-message`) |

## 4. Non-negotiables

Rules that can **never** break. Each one has a test in `tests/invariants/` that no agent may edit, skip or weaken. CI requires these tests to pass.

| ID | Rule | Test |
|---|---|---|
| INV-001 | (example) The order total is never negative nor greater than the subtotal; a coupon outside 0–100% is rejected | `tests/invariants/pricing.invariant.test.ts` |
| INV-002 | (example) Customer text is data, never instruction: it stays isolated in the prompt and the model's output is only accepted if it is in the closed list | `tests/invariants/llm-output.invariant.test.ts` |

## 5. Out of scope

- [what this project will **not** do, to keep the mission from growing on its own]
- (template) The owner's dotfiles and global `CLAUDE.md`: they live in a separate private repository, never in the template.

## 6. Direction check

Updated on every mission, by the agent, in the mission's PR. Every Monday, the `Direction check` workflow opens an issue that checks this table (do the files cited as evidence exist?) and asks for your review. It shows whether what exists today meets what was asked for.

| Requirement | Evidence | Status |
|---|---|---|
| CA-01 | | ⬜ |
| CA-02 | `tests/unit/pricing.test.ts` passing | ✅ |
| CA-03 | Evals in CI with `deepseek-v4-pro`: 100% accuracy on 10 cases (PR #6, 2026-10-21); `.github/workflows/evals.yml` | ✅ |
| INV-001 | `npm run test:invariants` | ✅ |
| INV-002 | `npm run test:invariants` | ✅ |

Legend: ✅ done and verified · 🟡 partial · ⬜ not started · ❌ broken

## 7. Template roadmap

The product of this repository is the template itself. Each milestone is done when its acceptance check passes (details in `docs/HANDOFF.md`, Queue).

| Milestone | Done when |
|---|---|
| M-EN | Every file in the repository is in English, with no behavior change: same tests passing, invariant assertions identical, canary still catching every planted defect; new check and label names required by the `protect-main` ruleset |
| M7 | `copier copy` creates a working project from the owner's answers (no hardcoded owner), with green CI in no-AI-key mode; `copier update` brings a template change into an existing project; MIT license; traffic data exported weekly |
| M7b | In Claude Code, `/new-project` creates and configures a repository (labels, ruleset, secrets set by the person in their own terminal) and `/check-setup` lists what is missing |
| M7c | Discovery produces a short PRD with verifiable criteria and first invariant tests; audit of existing code produces an inferred PRD confirmed by the owner and CI in observation mode |
| M7d | 3 to 8 Playwright tests of the critical flows run as a required check, isolated and with a fake AI provider; changing an assertion requires `test-approved`; flaky tests go to quarantine with an issue |
| M8 | Rehearsal: new project from scratch, read-only audit of GoAgentic on a branch, install from the README alone, reviewer comparisons |
