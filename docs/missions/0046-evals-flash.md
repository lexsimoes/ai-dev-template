# Mission 0046: the evals' default model is deepseek-flash

**Status:** in progress
**Branch:** `mission/0046-evals-flash` · **PR:** see the PR of `mission/0046-evals-flash`
**Created on:** 2026-10-27 · **Approved by the owner on:** 2026-10-27 (decision relayed by the owner's consultor-ia session: DeepSeek V4.1 Flash 1017, `deepseek-flash`, is the best and most recent model and is the default in the template, for the evals as it already is for the reviewer's `standard` tier)

## Goal

A project created or updated from the template measures its AI functions with `deepseek-flash` by default, the same model its reviewer uses, at about a quarter of the price of `deepseek-v4-pro`.

## Context

- Mission 0034 moved the reviewer's `standard` and `light` tiers to `deepseek-flash` (DeepSeek-V4.1-Flash-1017). The evals stayed on `deepseek-v4-pro` (`.github/workflows/evals.yml`), with the repository variable `EVAL_MODEL` as the override.
- `evals/config.json` already prices `deepseek-flash` ($0.30 / $1.20 per million tokens).
- `reasoning_effort: "none"` (the evals' default `EVAL_EXTRA_BODY`) with `deepseek-flash`: consultor-ia, a project generated from the template, ran its evals with `EVAL_MODEL=deepseek-flash` on 2026-10-27 ([run 40594339878](https://github.com/lexsimoes/consultor-ia/actions/runs/40594339878)). The API accepted the field; the sample `classify-message` suite scored 100% with 261 output tokens for 10 cases (about 26 per answer), so no reasoning ran. The reviewer's `light` tier sends `"low"` because it wants some reasoning; the classifier does not.

## Authorization

The agent may edit `.github/workflows/evals.yml` (the default model only), `evals/README.md`, `docs/WORKFLOW.md`, `README.md`, `.env.example`, the example in `src/ai/providers/openai-compatible.ts`, `tests/unit/evals-lib.test.ts` (a new test), `CHANGELOG.md`, `docs/HANDOFF.md` and this mission.

What the agent may not do (it stops and asks): touch `tests/invariants/`, the golden set, the eval thresholds, `evals/config.json` pricing, the reviewer's tiers, or the `consultor-ia` repository.

## Items

- [x] 1. `.github/workflows/evals.yml`: `LLM_MODEL: ${{ vars.EVAL_MODEL || 'deepseek-flash' }}`; `EVAL_EXTRA_BODY` default `{"reasoning_effort":"none"}` kept (evidence above).
- [x] 2. Docs: `evals/README.md` (local run, variables table, why `"none"` works with Flash), `docs/WORKFLOW.md` (DeepSeek options, evals section), `README.md` (costs), `.env.example` (model example), the `LLM_MODEL` error example.
- [x] 3. Test: `tests/unit/evals-lib.test.ts` checks that the workflow's default model is `deepseek-flash`, is priced in `evals/config.json`, and keeps reasoning off. It fails on the old default.
- [x] 4. `CHANGELOG.md` (Unreleased) and `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The evals default to `deepseek-flash` in every generated place | `grep` of the rendered project in the `template` check; the new unit test, which also runs in generated projects |
| `reasoning_effort: "none"` is valid for `deepseek-flash` | the consultor-ia run above; this PR's `evals` check, if it runs the model |
| `npm run check` green | CI |

## Report

_(filled in by the agent at the end)_
