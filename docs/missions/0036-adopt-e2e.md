# Mission 0036: the adoption kit ships the end-to-end tester

**Status:** in review
**Branch:** `mission/0036-adopt-e2e` · **PR:** see the PR of `mission/0036-adopt-e2e`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("The adoption kit must ship with the Playwright tester in v0.4.0, not after.")

## Goal

An existing project with a web UI gets, through `/adt:adopt`, the same end-to-end tester a new project has: isolated tests of the critical flows, written and repaired by the Playwright test agents, guarded so that an agent can change selectors only. It runs in observe mode.

## Context

- M7d built the tester for new projects (missions 0025 to 0028): `e2e/`, `playwright.config.ts`, the agents, `scripts/guard-e2e.ts`, the `e2e` check.
- The adoption kit (mission 0021) never changes the project's `package.json`, and a project may not have `@playwright/test`, or even Node dependencies (`adt-sandbox-legacy` has none). Its app starts in its own way, with its own settings for real services.
- `adt-sandbox-legacy` (M8) is the test case: a plain `node:http` booking app whose mailer only prints when `SMTP_HOST` is unset.

## Authorization

The agent may add kit files under `adopt/`, change `adopt/kit.json`, `plugins/adt/scripts/adopt.ts`, `plugins/adt/scripts/lib/adopt.ts`, `plugins/adt/scripts/lib/checks.ts`, the `adopt` skill, `scripts/guard-e2e.ts` (tighten only) and their tests, and the docs.

What the agent may not do (it stops and asks): touch `tests/invariants/`, the template's own `e2e/` or `playwright.config.ts`, or make any adopted check required.

## Items

- [x] 1. A self-contained `e2e/` for adopted projects:
  - `e2e/package.json` and lockfile pin `@playwright/test` 1.64.1 and `typescript` 6.0.3, the template's versions;
  - `e2e/playwright.config.ts` is filled from the answers. It starts the app from the project's root, sets the isolated variables, and never reuses a server;
  - plus `e2e/fixtures.ts` (the template's), a neutral `e2e/seed.spec.ts` and `e2e/.gitignore`.
- [x] 2. `adt-e2e` workflow (observe mode, read-only, no secret):
  - the parser comes from the target branch's e2e lockfile, with its integrity checked;
  - the guard runs from the target branch, before any install;
  - the tester and the project's lockfile are installed with `--ignore-scripts`;
  - then Playwright runs, with the flaky summary; quarantined tests run but never count.
- [x] 3. The Playwright test agents and `.mcp.json` (with `--prefix e2e`). The project's label names and the isolated-mode wording replace the template's.
- [x] 4. Answers:
  - `--e2e-start`, `--e2e-port`, `--e2e-env`, or `none`, each checked against a closed pattern and written into the config as JSON literals;
  - a new label role `testApproved`;
  - `adt-e2e` in `.github/adt.json` and in `/adt:check-setup`;
  - the owner in `CODEOWNERS` for `e2e/`;
  - an "End-to-end tests" section in the adopted `AGENTS.md`.
- [x] 5. `scripts/guard-e2e.ts`:
  - non-code files in `e2e/` are protected;
  - `node_modules/` is never read;
  - the first setup is listed, not blocked;
  - the owner of `INVARIANTS_DIR` approves when `e2e/` has none.
- [x] 6. A placeholder with a digit (`{{E2E_PORT}}`) is filled, and a missing one is an error. Before this, a name with a digit was silently left in the file.
- [x] 7. Skill, README, CHANGELOG, HANDOFF.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The kit writes the tester, with the project's labels, and never the project's `package.json` | `tests/unit/plugin-adopt.test.ts`, "the end-to-end tester (M8)…" |
| No answer can break out of the config or the workflow | same test (shell, quotes, `$(…)`, `PORT`) |
| Guard: dependencies protected, `node_modules/` ignored, first setup, invariants owner | `tests/unit/guard-e2e.test.ts`, three new tests |
| It works on a real app | the kit applied to a clone of `adt-sandbox-legacy`: the seed passes against its app; the guard passes on first setup; the MCP server starts |
| On GitHub | `adt-e2e` on the legacy adoption PR (after this PR's kit is applied there) |
| `npm run check` green | CI |

## Report

_(filled in at the end)_
