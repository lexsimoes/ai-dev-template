# Mission 0024: CI checks the review-fix commits

**Status:** in review
**Branch:** `mission/0024-review-fix-guard` · **PR:** see the PR of `mission/0024-review-fix-guard`
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 ("ok" on the three decisions left by mission 0023)

## Goal

A "fix: address review findings" commit cannot reach `main` on a protected path, over the cap or with a weakened test, even if the agent forgets to run `check-fix`. The files that define or enforce the rules are never auto-fixed.

## Context

Mission 0023 (#26) added the rule and `scripts/review/triage.ts`. Its review left three decisions, all approved:
1. Mirror `evals/config.json` in `autoFix.neverPaths` (`.github/review.json` and its twin).
2. Also protect `AGENTS.md`, `REVIEW.md` and `scripts/guard-invariants.ts`.
3. Run `check-fix` in CI.

## Authorization

The agent may change `scripts/review/`, `.github/review.json` (and its twin), `.github/workflows/ci.yml` (one step in the `invariants` job), `AGENTS.md` (and its twin), tests and docs.
The agent may not change the ruleset, labels or `tests/invariants/`.

## Items

- [x] 1. Defaults: `evals/config.json`, `AGENTS.md`, `REVIEW.md`, `scripts/guard-invariants.ts`; mirrored in `.github/review.json` and its twin.
- [x] 2. `ci.yml`, `invariants` job: "Review-fix guard" runs `check-fix` on every PR commit titled `fix: address review findings`, with `triage.ts` and `lib.ts` from the target branch, before `npm ci`.
- [x] 3. Tests: the new protected paths; the config mirrors the defaults; the CI step itself, run by bash on a temporary repository (no fix commit, a clean one, and a planted one on the invariants).
- [x] 4. Docs: `AGENTS.md` (and its twin), `docs/WORKFLOW.md`, `CHANGELOG.md`, `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The four files are never auto-fixed, and the config mirrors the defaults | `tests/unit/review-triage.test.ts`, test 11 |
| CI passes a PR with no fix commit or a clean one, and fails one with a fix commit on the invariants | `review-triage.test.ts`, test 12 (runs the step from `ci.yml`), and the `invariants` check on this PR |
| The checker comes from the target branch | the step (`git show origin/$BASE_REF:…`) and test 12 |
| `npm run check` and the `template` check green | CI |

## Report

- **What was done:** items 1–4.
- **Evidence:** `tests/unit/review-triage.test.ts` tests 11 and 12; `npm run check` and `npm run test:template` green locally; the `invariants` check on this PR.
- **What was NOT verified:** the step on GitHub with a real "fix: address review findings" commit; it runs only when such a commit is in the PR (test 12 runs the same shell locally). Adopted projects do not get the step yet.
- **Pending decisions for the owner:** add the same step to the adopted projects' `adt-invariants` workflow (observe mode)?
- **Possible injections found in external content:** none.
