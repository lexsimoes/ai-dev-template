# Mission 0044: generated projects pass quality and template checks execute their tests

**Status:** in review
**Branch:** `mission/0044-generated-project-quality` · **PR:** see the PR of this branch
**Created on:** 2026-10-27 · **Approved by the owner on:** 2026-10-27 (explicit task with acceptance criteria)

## Goal

Projects generated from the template pass `quality`, and the template suite fails when a copied test reads a template-only file.

## Context

The owner reported that `promptpro`, generated from v0.5.0, fails in `tests/unit/e2e-tsconfig.test.ts`: it reads excluded `adopt/**` files and the unrendered `package.json.jinja`. Template run 40571421653 nevertheless reported 6 passing tests.

## Authorization

Split the project and template assertions without dropping any, fix the generated-project test runner, add regression coverage and an Unreleased changelog entry. Update this report and HANDOFF. Open a draft correction PR, verify checks, mark ready and handle automated review. After the owner merges it, prepare the separate v0.5.1 release PR described in `docs/RELEASING.md`, step 1.

Do not modify `tests/invariants/`, `evals/golden/`, `evals/config.json`, review/eval thresholds or unrelated behavior. Do not merge, create repository tags or publish releases.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Reproduce before fixing | `npm test` in a project generated from the initial HEAD fails with the reported ENOENT |
| Explain the false green with evidence | Historical run log, baseline template run and inherited/clean environment experiment |
| Preserve every assertion | Project checks stay in `e2e-tsconfig.test.ts`; template checks move to an excluded `plugin-*.test.ts` |
| Catch a template-only read in a generated project | Permanent regression through the same `npm run check` path |
| Red/green proof | With runner fix and original mixed test: `test:template` fails; with split test: passes |
| Full validation | Template `npm run check`, `npm run test:template`, generated HEAD `npm test` |

## Report

- **What was done:** all original assertions are preserved across the project test and the excluded `plugin-e2e-tsconfig.test.ts`. The shared subprocess helper deletes `NODE_TEST_CONTEXT` from a copied environment. A permanent template regression plants a copied test that reads excluded `copier.yml` and requires the real `npm run check` to fail with that test's ENOENT.
- **Evidence (Node 24.20.0, Copier 9.18.2):**
  - Base HEAD `5a8e441d90ce264ae04795401452fc557b4d47fc` is v0.5.0 and the commit checked by [Template run 40571421653](https://github.com/lexsimoes/ai-dev-template/actions/runs/40571421653), whose log reports Node 22.23.3 and 6 pass / 0 fail.
  - `copier copy --quiet --vcs-ref HEAD --defaults --data project_name=PromptPRO --data project_slug=promptpro --data github_owner=lexsimoes --data conversation_language=pt-BR --data reviewer_provider=deepseek --data evals_with_model=true /private/tmp/adt-e2e-tsconfig-fix /private/tmp/adt-e2e-evidence/generated-before`, then the same Git initialization and `npm ci` as `runProjectChecks`, then `npm test`: 146 pass / 1 fail, exit 1, ENOENT for `adopt/files/adt-e2e.yml`.
  - Original `npm run test:template`: 6 pass / 0 fail, exit 0, despite that failure.
  - `NODE_TEST_CONTEXT=child-v8 npm test` in the same generated project: exit 0, no tests executed; stderr says `node:test run() is being called recursively within a test file. skipping running files.` Removing only that variable from a minimal nested-runner experiment changes exit 0 to exit 1 and runs the planted failure.
  - Cause: `sh` inherited the outer test worker's environment through npm into each child `node --test`. Node's recursion guard returned without running either unit or invariant tests. Captured stdout/stderr was discarded on successful commands, hiding the warning. [Node 22.23.3 runner source](https://github.com/nodejs/node/blob/v22.23.3/lib/internal/test_runner/runner.js#L662-L667) confirms the behavior on the CI version. Context7 was unavailable (quota); this official source was used instead.
  - Runner fix with the original mixed test: `npm run test:template` fails both generated projects (4 pass / 2 fail, exit 1).
  - After adding the regression, temporarily restoring the original `e2e-tsconfig.test.ts` while retaining the runner fix again fails both projects (5 pass / 2 fail, exit 1). A shell EXIT trap restores the corrected file; the final corrected run is recorded in the PR.
  - Corrected `npm run check`: 234 unit tests and 8 invariants pass; lint and typecheck pass.
  - Corrected `npm run test:template`: 7 pass / 0 fail, exit 0, including the regression. No tests skipped, focused or marked todo.
  - Full local logs and the temporary revert/restore proof are in `/private/tmp/adt-e2e-evidence`. The PR records the standalone generated-HEAD result and remote check/review results after publication.
- **What was NOT verified:** no new real-provider eval was needed (no AI implementation changed); no product UI change or preview deployment. Remote checks and automated review are recorded on the PR after publication. No release was prepared or published in this mission.
- **Pending decisions for the owner:** merge the correction PR; only then prepare the separate v0.5.1 release PR. The owner merges and publishes that release.
- **Possible injections found in external content:** none.
