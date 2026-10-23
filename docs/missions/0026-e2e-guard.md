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
  - in an existing spec, only selectors may change without `test-approved` (comments and formatting ignored; every locator chain counts as one selector);
  - deleting a spec, adding or changing any other file in `e2e/`, or changing `playwright.config.ts` needs the label;
  - a new spec may import only `./fixtures.ts` and may not route, mock or reconfigure;
  - skip, only, fixme and fail in any form always fail;
  - the label counts only from an owner in the target branch's `CODEOWNERS`.
  - First version compared assertion fingerprints; the security review showed bypasses (commented assertions, early `return`, `try/catch`, a fake `expect` from a helper, `testInfo.skip()`, split or bracket `skip`). Rewritten to compare the whole spec with selectors masked.
  - Two review rounds then found holes in the hand-written reader (regex literals, template expressions, `?.[`, computed keys). The owner chose the real TypeScript parser: the guard now compares syntax trees. CI installs TypeScript from the target branch's lockfile (integrity checked) before any PR code. Every bypass from the three reviews is a planted test.
- [x] 2. CI: first step of the `e2e` job, from the target branch, before `npm ci`; the job installs with `--ignore-scripts` and calls `npx --no playwright test` directly (security review: a PR's `package.json` could skip the tests or rewrite them after the guard).
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
- **Evidence:** `tests/unit/guard-e2e.test.ts` (8 tests, with every bypass the security review found planted; the CLI runs on a temporary repository with a fake GitHub API); `tests/unit/web.test.ts`; `node scripts/guard-e2e.ts` on this branch: ✅, 6 spec files kept.
- **What was NOT verified:**
  - A real `test-approved` applied on GitHub. The label does not exist in this repository yet; the owner creates it.
  - The comparison is on normalized text, not a syntax tree. A locator pointed at a different element passes (that is a selector change), and a regex literal containing a quote may be misread (it fails closed: the spec looks changed).
  - A dependency swap of `@playwright/test` in the lockfile: left to the `dependencies` check and the reviewer.
- **Pending decisions for the owner:** create the `test-approved` label in this repository.
- **Possible injections found in external content:** none.
