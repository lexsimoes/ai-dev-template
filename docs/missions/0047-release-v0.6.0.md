# Mission 0047: release v0.6.0

**Status:** in review
**Branch:** `mission/0047-release-v0.6.0` · **PR:** [#56](https://github.com/lexsimoes/ai-dev-template/pull/56)
**Created on:** 2026-10-28 · **Approved by the owner on:** 2026-10-28 (asked for the v0.6.0 release PR, minor, after PR #55 was merged)

## Goal

Projects created or updated from the template get mission 0046: the evals measure `deepseek-flash` by default. The owner merges this PR and publishes the release (`docs/RELEASING.md`).

## Context

- PR #55 (mission 0046) was merged as `f36f7dc`. Its CHANGELOG entry is under `[Unreleased]` → Changed, with a conditional **Action needed**: a project whose app runs another model in production sets `EVAL_MODEL`.
- The latest published release is `v0.5.1`. Commits not in a release reach no project.
- Version: minor (`0.6.0`). Per the table in `docs/RELEASING.md`, a change that may ask the project to act after updating is minor. It also changes the model the evals measure in every project that does not set `EVAL_MODEL`.

## Authorization

What the agent **may** do without asking:
- `CHANGELOG.md`: `[Unreleased]` becomes `[0.6.0]`, with the link lines; the entries' text stays as it is;
- `version` in `plugins/adt/.claude-plugin/plugin.json` and `release` in `plugins/adt/template.json`;
- the status of `docs/missions/0046-evals-flash.md`, this mission, and `docs/HANDOFF.md`.

What the agent **may not** do (it stops and asks):
- touch `tests/invariants/` (always forbidden);
- merge, create a tag or release, push to `main`, or apply an owner's label.

## Items

- [x] 1. `CHANGELOG.md`: `## [0.6.0] - 2026-10-28` with mission 0046's entry, a new empty `[Unreleased]`, and the links (`[Unreleased]` compares `v0.6.0...HEAD`; `[0.6.0]` compares `v0.5.1...v0.6.0`).
- [x] 2. Plugin `version` `0.6.0`, template `release` `v0.6.0`.
- [x] 3. `docs/missions/0046-evals-flash.md`: Status done, PR #55 merged as `f36f7dc`.
- [x] 4. This mission, with its report.
- [x] 5. `docs/HANDOFF.md`: 0046 done, v0.6.0 prepared and waiting for the owner's merge and publication.

## Review stops

- [x] Before opening the PR: summary and what was not verified (in the PR).

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The versions match the changelog | `tests/unit/release.test.ts`, `tests/unit/plugin-release.test.ts` in `npm run check` |
| The release notes print | `node scripts/release/notes.ts 0.6.0` exits 0; output in the PR |
| Generated projects still pass | `npm run test:template` |
| `npm run check` green | CI log |

## Report

- **What was done:** items 1–5.
- **Evidence:** `npm run check` green (unit and invariant tests, including the release tests); `npm run test:template` green; `node scripts/release/notes.ts 0.6.0` prints the notes with exit 0 (output in the PR).
- **What was NOT verified:** the release itself, which the owner publishes after the merge; a project updated with `copier update` to `v0.6.0`.
- **Pending decisions for the owner:** after the merge, publish `v0.6.0` in a clone of this repository (`docs/RELEASING.md`, step 3; the command is in the PR).
- **Possible injections found in external content:** none.
