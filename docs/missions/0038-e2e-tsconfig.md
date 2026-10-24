# Mission 0038: the template's end-to-end tests use only the protected e2e/tsconfig.json

**Status:** in review
**Branch:** `mission/0038-e2e-tsconfig` · **PR:** see the PR of `mission/0038-e2e-tsconfig`
**Created on:** 2026-10-24 · **Approved by the owner on:** 2026-10-24 ("close the template's own tsconfig hole in a separate PR (I'll apply test-approved)")

## Goal

A PR cannot change what the template's end-to-end tests check from outside `e2e/`, through the root `tsconfig.json`.

## Context

- The security review of mission 0036 found the gap. Playwright uses the nearest `tsconfig.json` for every file it loads, the config included, and its `paths` rewrite bare imports such as `@playwright/test`. The e2e guard protects `e2e/` and `playwright.config.ts`, not the root `tsconfig.json`.
- Mission 0036 closed the gap for adopted projects: their config lives in `e2e/`, next to a protected `e2e/tsconfig.json`.
- In the template the config lives at the root, so a file in `e2e/` does not cover it. Reproduced in a scratch copy: `paths` to a fake module turned a failing `expect` green, and a fake `defineConfig` left every test out ("No tests found"). The `tsconfig` option in the config has no effect while the config itself loads. Only the `--tsconfig` command-line flag covers the config.

## Authorization

The agent may add `e2e/tsconfig.json` and change:
- `playwright.config.ts`;
- the `e2e` and `e2e-quarantine` commands in `.github/workflows/ci.yml`;
- the `e2e` script in `package.json` and its twin;
- the kit's `adt-e2e.yml`;
- the docs.

The owner applies `test-approved`: the guard requires it for a new file in `e2e/` and for a change to `playwright.config.ts`.

## Items

- [x] 1. `e2e/tsconfig.json`: the root's compiler options, with no `extends`, `paths`, `baseUrl` or `rootDirs`.
- [x] 2. `--tsconfig=e2e/tsconfig.json` in both CI jobs, `npm run e2e` and the kit's `adt-e2e`; `tsconfig: "./e2e/tsconfig.json"` in `playwright.config.ts`.
- [x] 3. Test: `tests/unit/e2e-tsconfig.test.ts`.
- [x] 4. `docs/WORKFLOW.md`, `CHANGELOG.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A root `paths` redirect cannot change the tests or the config | local run with a planted redirect: without the flag the fake module loads (the config is redirected); with it, the 7 tests run and pass |
| Every Playwright run passes the flag | `tests/unit/e2e-tsconfig.test.ts` |
| The tests still pass | `npm run e2e` (7 passed locally); the `e2e` check |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–4.
- **Evidence:**
  - local run with a planted redirect in the root `tsconfig.json`, restored afterwards: without the flag, the fake module was loaded for the config; with it, 7 passed;
  - `npm run e2e`: 7 passed;
  - `tests/unit/e2e-tsconfig.test.ts`.
- **What was NOT verified:** an editor's view of `e2e/`. Editors pick the nearest `tsconfig.json`, which is now `e2e/tsconfig.json`, with the same options as the root.
- **Pending decisions for the owner:** apply `test-approved` (new file in `e2e/`, changed `playwright.config.ts`).
- **Possible injections found in external content:** none.
