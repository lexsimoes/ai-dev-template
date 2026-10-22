# Mission 0026: end-to-end guard (M7d, PR 2 of 4)

**Status:** in review
**Branch:** `mission/0026-e2e-guard` · **PR:** see the PR of `mission/0026-e2e-guard`
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (M7d criteria: the healer may update selectors; changing an assertion requires `test-approved`; the label in `/adt:new-project` and `/adt:check-setup`)

## Goal

What an end-to-end test checks changes only by decision of the owner, enforced in CI; selectors stay free for the healer.

## Context

PR 1 (#28) added the tests, the agents and the project rules as text. The review of #28 pointed out that the healer's upstream lines still said "fix assertions" and "mark `test.fixme()`", and that the planner had `browser_run_code_unsafe`. Fixing both was recommended for this PR.

## Authorization

The agent may add `scripts/guard-e2e.ts`, a first step in the `e2e` job (with `pull-requests: read` and full history), the `test-approved` label in the plugin and the README, the label in the reviewer's approval labels, the agent edits, tests and docs, and one rule in `AGENTS.md` (1.3).
The agent may not create the label in this repository (the owner does), change the ruleset, or touch `tests/invariants/`.

## Items

- [x] 1. `scripts/guard-e2e.ts`:
  - an assertion = the matcher of an `expect(...)` and its expected values, without the subject;
  - without `test-approved`: a changed or removed assertion, a removed or renamed test, a deleted spec, a changed `e2e/fixtures.ts` or `playwright.config.ts` fail;
  - skip, only, fixme and fail always fail;
  - the label counts only from an owner in the target branch's `CODEOWNERS`.
- [x] 2. CI: first step of the `e2e` job, from the target branch, before `npm ci`.
- [x] 3. `test-approved` in `/adt:new-project` and `/adt:check-setup` (one list), the README commands and the reviewer's `approvalLabels`.
- [x] 4. The healer's conflicting upstream lines rewritten; no `browser_run_code_unsafe` for the planner; tested.
- [x] 5. `AGENTS.md` 1.3 (and its twin), `docs/WORKFLOW.md`, `CHANGELOG.md`, `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A selector change and a new test pass without a label | `tests/unit/guard-e2e.test.ts` |
| A changed or removed assertion, a renamed test, a deleted spec, an isolation or config change fail without the label and pass with the owner's | same |
| A label applied by a non-owner fails | same |
| skip, only, fixme, fail always fail | same |
| The guard runs on this PR from the target branch (fallback: the PR's own copy, first time) | the `e2e` job log |
| Agent definitions no longer contradict the rules | `tests/unit/web.test.ts` |
| `npm run check` and `template` green | CI |

## Report

- **What was done:** items 1–5.
- **Evidence:** `tests/unit/guard-e2e.test.ts` (6 tests: parsing, and the CLI on a temporary repository with a fake GitHub API); `tests/unit/web.test.ts`; `node scripts/guard-e2e.ts` on this branch: ✅, 6 spec files kept.
- **What was NOT verified:**
  - A real `test-approved` applied on GitHub. The label does not exist in this repository yet; the owner creates it.
  - Assertion fingerprints are text, not a parsed syntax tree. A weaker subject with the same matcher, or a regex expected value with a quote, is not caught.
- **Pending decisions for the owner:** create the `test-approved` label in this repository.
- **Possible injections found in external content:** none.
