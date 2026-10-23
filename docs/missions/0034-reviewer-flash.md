# Mission 0034: the reviewer's default model is deepseek-flash; canary fixture fixed

**Status:** in review
**Branch:** `mission/0034-reviewer-flash` · **PR:** see the PR of `mission/0034-reviewer-flash`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("Switch standard and light tiers to deepseek-flash (pinned to V4.1-Flash-1017); keep deepseek-v4-pro documented as an option; deep-review stays on Claude. Fix the canary diff cropping in the same PR; re-run the canary with Flash after the fix and report planted-defect recall.")

## Goal

Regular and trivial PRs are reviewed by the model that measured best for the price, and the canary no longer plants a false positive by accident.

## Context

- Mission 0033 compared the two DeepSeek models side by side (#39). Flash found the same planted defects, found more real extras on #35, cost 4 to 5 times less and ran 2 to 3 times faster.
- Both models reported one false positive on the canary: "`applyCoupon` called without `now`". The fixture's hunk header cut the signature at `now: D…`, so the default value `now: Date = new Date()` was not visible.
- DeepSeek has no dated model ids. `deepseek-flash` serves DeepSeek-V4.1-Flash-1017, listed in `/models` as `DeepSeek-V4.1-Flash`, with fingerprint `e72d3c7f663d3e1383b00b3884cb4501`.

## Authorization

The agent may edit `.github/review.json` and its twin (the `standard` and `light` tiers only), the canary fixtures (`scripts/review/canary/`), `docs/WORKFLOW.md`, `README.md`, `CHANGELOG.md`, `docs/HANDOFF.md` and this mission.

What the agent may not do (it stops and asks): touch `tests/invariants/`, the `sensitive` and `deep` tiers (Claude), or the evals model.

## Items

- [x] 1. `standard` and `light` tiers: `model: deepseek-flash`, `pinnedVersion: DeepSeek-V4.1-Flash`, `pinnedFingerprint: e72d3c7f…`, Flash prices. The tier's `$comment` names the release (V4.1-Flash-1017) and the alternative.
- [x] 2. Canary fixtures: the `src/pricing.ts` hunks of `canary.diff` and `incremental/incremental.diff` now start at the `applyCoupon` signature. They are regenerated with `git diff` from the real `src/pricing.ts`. The planted lines and their line numbers do not move, so `expected.json` and `previous.json` are unchanged.
- [x] 3. Docs: `docs/WORKFLOW.md` (tiers table, DeepSeek options with Flash as the default, how to go back to Pro, what the pin does not catch, costs), `README.md` (cost), `CHANGELOG.md`, `docs/HANDOFF.md`.
- [ ] 4. Canary with Flash after the fix (the 3 cases, run by this PR's `review-canary` when it becomes ready): planted-defect recall and false positives, in the report.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Both DeepSeek tiers use Flash, pinned | `.github/review.json`; `tests/unit/review.test.ts` (every shipped tier is pinned); the template test |
| The canary sees the `applyCoupon` signature | the fixture diff |
| Flash still finds the 6 planted defects (full, light) and both incremental verdicts | the 3 `review-canary` checks on this PR, with the findings |
| The pin check passes against the real API | the canary runs (no pin error or note) |
| `npm run check` green | CI |

## Report

_(filled in at the end)_
