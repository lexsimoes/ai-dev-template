# Mission 0027: flaky end-to-end tests and quarantine (M7d, PR 3 of 4)

**Status:** in review
**Branch:** `mission/0027-e2e-quarantine` · **PR:** see the PR of `mission/0027-e2e-quarantine`
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (M7d criteria: "a flaky test goes to quarantine with an issue opened, never silently disabled"; quarantine needs `test-approved`)

## Goal

A test that fails only sometimes is seen and tracked, never switched off; quarantine takes it out of the required check only by the owner's decision, with an open issue, and it keeps running.

## Context

PR 2 (#29, #30) forbids `skip`, `fixme`, `only` and `fail` in any form and points flaky tests to quarantine, which did not exist yet. CI retries a failed test twice, so a flaky test today passes in silence.

## Authorization

The agent may add `scripts/e2e-flaky.ts`, a quarantine rule in `scripts/guard-e2e.ts`, a JSON report and a summary step in the `e2e` job, a new `e2e-flaky` job (`issues: write`, pushes to `main` only), a new non-required `e2e-quarantine` job, `issues: read` for the `e2e` job, tests and docs, and one sentence in `AGENTS.md` 1.3.
The agent may not change the ruleset, apply `test-approved`, or touch `tests/invariants/`.

## Items

- [x] 1. `scripts/e2e-flaky.ts`: reads Playwright's JSON report; tests with status `flaky` (failed, then passed on a retry) go to the job summary with their failed attempt's error (colors stripped, cut to 12 lines); with `--issues`, one issue per test (`Flaky end-to-end test: <title>`), or a "Flaky again" comment on the open issue with the same title (pull requests excluded). The error sits in a fence it cannot close, marked as data.
- [x] 2. CI: the `e2e` job runs `--grep-invert @quarantine` with a JSON report and lists flaky tests on every run; on a push it keeps the report, and the `e2e-flaky` job (the only one with `issues: write`, never on a PR) files the issues. The `e2e-quarantine` job runs `--grep @quarantine` when any spec has the tag; it is not required.
- [x] 3. Guard rule 4: a test tagged `@quarantine` (in `tag`, or in its title) needs an `annotation: { type: "issue", description }` pointing at an issue of this repository (full URL or `#n`). In a PR, a closed issue fails ("Remove the tag") and an unreadable one fails. On `main` the state is only noted. Adding the tag changes the test, so the existing rule already asks for `test-approved`.
- [x] 4. `AGENTS.md` 1.3 (and its twin), `docs/WORKFLOW.md` "Flaky tests", `CHANGELOG.md`, `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A test that passes only on a retry is listed and gets an issue on `main`; an open issue gets a comment instead of a duplicate | `tests/unit/e2e-flaky.test.ts` (fake GitHub API); a real probe report run locally |
| Quarantine without the owner's label, or without an issue annotation, fails; with both and an open issue it passes; a closed issue fails in a PR | `tests/unit/guard-e2e.test.ts` |
| A quarantined test leaves the required check and runs in `e2e-quarantine` | `ci.yml` (`--grep-invert` / `--grep`); not exercised on a real run (no test is in quarantine) |
| `npm run check` and `template` green | CI |

## Report

- **What was done:** items 1–4.
- **Evidence:** `tests/unit/e2e-flaky.test.ts` (5 tests), `tests/unit/guard-e2e.test.ts` (2 new: the parse, and the CLI with an open, a missing and a closed issue); `node scripts/e2e-flaky.ts` on a real Playwright report with a planted flaky test listed it.
- **What was NOT verified:**
  - The `e2e-flaky` job opening a real issue: it runs only on a push to `main`, after the merge.
  - The `e2e-quarantine` job with a real quarantined test: no test is in quarantine.
  - A tag built at run time (`"@quar" + "antine"`) is not seen by the guard; Playwright would still leave the test out of the required check. Adding it to an existing test changes the test, so it needs `test-approved` anyway.
- **Pending decisions for the owner:** keep `e2e-quarantine` out of the required checks (recommended).
- **Possible injections found in external content:** none.
