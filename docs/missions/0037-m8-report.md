# Mission 0037: M8 rehearsal report, and the v0.4.0 release PR

**Status:** in review
**Branch:** `mission/0037-m8-report-v0.4.0` · **PR:** see the PR of `mission/0037-m8-report-v0.4.0`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("Then finish M8, write the M8 report, and release v0.4.0.")

## Goal

Record what the M8 rehearsal proved, what it found and what was fixed, so v0.4.0 is released on evidence. Then prepare the release PR. The owner merges it and publishes the release (`docs/RELEASING.md`).

## Authorization

The agent may write this report, update `docs/HANDOFF.md`, and prepare the release:
- `CHANGELOG.md` `[0.4.0]`;
- `version` in `plugins/adt/.claude-plugin/plugin.json`;
- `release` in `plugins/adt/template.json`.

It never merges, tags or publishes the release.

## M8 report (2026-10-23)

M8 ran both paths of the template on test repositories, never on GoAgentic:
- **new project:** `lexsimoes/adt-sandbox-m8`, private, created by the owner with `/adt:new-project` v0.3.0;
- **existing project:** `lexsimoes/adt-sandbox-legacy`, private, a small booking app on `node:http`, through `/adt:audit` and `/adt:adopt`.

The reviewer and the tester were measured along the way.

### What it proved

| Rehearsal | Result | Evidence |
|---|---|---|
| A PR that skips an invariant test is blocked, and an unrelated label does not turn the red check green | ✅ `invariants` red, `mergeable_state` blocked, with and without an unrelated label | [adt-sandbox-m8#1](https://github.com/lexsimoes/adt-sandbox-m8/pull/1) (closed unmerged) |
| A private project's `dependencies` check works without Advanced Security | ✅ green on a clean PR; red with `lodash@4.17.15` (3 high advisories) | [adt-sandbox-m8#2](https://github.com/lexsimoes/adt-sandbox-m8/pull/2) (closed unmerged), #36 |
| A newcomer can install from the README alone | ✅ after the fixes below. The first run was contaminated by a planted-bug branch and discarded. The rerun from a clean `main` found one real regression | #36, #37 |
| The reviewer finds planted defects | ✅ standard 4/4 and deep 4/4 on #35. Canary with `deepseek-flash` after the fixture fix: `full` 6/6, `light` 6/6, `incremental` 2/2, no false positive | #35 (closed), #39 (closed), #41 |
| The reviewer never switches models silently | ✅ each tier is pinned. A moved alias stops the review before any call, and a reply from another model is discarded | #40; the canary on #41 passed the pin against the real API |
| An exploratory session finds a real bug, and the bug goes through the full cycle | ✅ issue → failing end-to-end test → fix | issue #33, #34 |
| `/adt:audit` maps an existing app read-only and infers its PRD | ✅ after a fix: personal data and external input were missed in a plain `node:http` app. The owner confirmed the PRD with INV-004 and INV-005 added | #38 |
| `/adt:adopt` adopts it in observe mode, add-only | ✅ after the fixes below. `adt-review`, `adt-invariants` and `adt-e2e` run, and no check is required | [adt-sandbox-legacy#1](https://github.com/lexsimoes/adt-sandbox-legacy/pull/1) |
| The adoption kit ships the end-to-end tester, and its first tests run in CI | ✅ `adt-e2e` green on first setup; then 3 tests of the critical flows (CA-01 list with spots left and "Full", CA-02 book, CA-03 cancel), all green on the first attempt | #43, [adt-sandbox-legacy#2](https://github.com/lexsimoes/adt-sandbox-legacy/pull/2) |

### What it found, and where it was fixed

| Finding | Fix |
|---|---|
| A private repository's `dependencies` check failed on every PR, because GitHub's dependency review needs Advanced Security | #36: `npm audit` of what the PR introduces; `/adt:check-setup` flags it |
| README: two plugin commands pasted on one line failed; the local checks came after the push; the first commit came after creating the repository | #36, #37 |
| Demo contact form: a message within the limit was refused when it had line breaks or was in a non-Latin alphabet | #34 (found by the exploratory session) |
| `/adt:audit` saw personal data only in SQL and external input only in Next.js routes | #38 |
| `/adt:adopt` required an eval command and required checks, so a project without AI code or CI could not be adopted | #38 (`none` for both) |
| The invariant guard crashed when a just-adopted project had no invariants folder, so `adt-invariants` was red on every PR | #38; #42 proves that deleting the folder still fails |
| DeepSeek moved an alias upstream (`deepseek-flash` now serves V4.1-Flash-1017), so the reviewer could change models without notice | #40 (pinned versions); #41 (Flash is the default, Pro documented) |
| The canary's hunk header cut the `applyCoupon` signature, so both models reported a false "missing `now`" | #41 |
| The adoption kit had no end-to-end tester | #43 |
| The adopted `AGENTS.md` said that "touching anything else in `e2e/`" needs `test-approved`. The reviewer on adt-sandbox-legacy#2 read that as covering new tests, which the guard allows, and blocked the PR | #43 (the adopted rule now has its own line: a new test that follows the rules needs no label); the same text fixed on adt-sandbox-legacy#1 |
| Security review of #43: a spec whose name git quotes was invisible to the new guard listing; a root `tsconfig.json` could redirect `@playwright/test` in the tests | #43 (`git -z`; protected `e2e/tsconfig.json`) |

### Known limits (not fixed, listed for the owner)

- **The reviewer's incremental review** re-checks a previous finding only when the finding's file changes.
  - A finding fixed elsewhere stays "pending" (#40).
  - A finding fixed only in the PR description is not re-checked without a new commit: `re-review` with no new commit recomputes the verdict and makes no call (#42).
- **A same-name DeepSeek release** (a newer V4.1-Flash) passes `pinnedVersion`; only the fingerprint note shows it.
- **The template's own e2e setup** has the root-`tsconfig` gap that #43 closed for adopted projects. Fixing it changes `playwright.config.ts`, which needs `test-approved`.
- **`adt-e2e` installs only an npm lockfile.** An app that needs more to start (another language, a database) needs its own setup step, which is a CI change and the owner's decision.
- **The Playwright test agents were not driven through their MCP server in this session** (no MCP tools here). The server starts, and the legacy tests were written by hand under the same rules.

### Not done in M8

- **`/adt:adopt` from the released plugin.** It fetches the pinned release, and the new kit arrives with v0.4.0. In the rehearsal it ran with `--kit` pointing at the template branch.
- **A private project updated with `copier update`** to the new release.
- **GoAgentic.** Not touched: it is the first real use, after v0.4.0, with the owner watching.

## Items

- [x] 1. M8 report (above).
- [ ] 2. Release: `CHANGELOG.md` `[0.4.0]`, plugin `version` `0.4.0`, template `release` `v0.4.0`. This comes after #41, #42 and #43 are merged, so the changelog holds all of them.
- [ ] 3. `docs/HANDOFF.md`: M8 done, v0.4.0 ready to publish.

## Report

_(filled in at the end)_
