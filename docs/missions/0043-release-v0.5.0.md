# Mission 0043: release v0.5.0

**Status:** in review
**Branch:** `mission/0043-release-v0.5.0` · **PR:** see the PR of `mission/0043-release-v0.5.0`
**Created on:** 2026-10-27 · **Approved by the owner on:** 2026-10-27 (asked for the v0.5.0 release PR before starting a new app with the template)

## Goal

New projects, and projects that run `copier update`, get the work merged since v0.4.0: the `/adt:guide` path, the discovery mockup, end-to-end tests planned apart from the code, the fingerprint issue and the reviewer and e2e fixes. The owner merges this PR and publishes the release (`docs/RELEASING.md`).

## Authorization

The agent may prepare the release:
- `CHANGELOG.md` `[0.5.0]`;
- `version` in `plugins/adt/.claude-plugin/plugin.json`;
- `release` in `plugins/adt/template.json`;
- `docs/HANDOFF.md`.

It never merges, tags or publishes the release.

## Items

- [x] 1. `CHANGELOG.md`: `[Unreleased]` becomes `[0.5.0] - 2026-10-27` (missions 0038 to 0042: #45, #46, #47, #49, #50), with the link lines. The e2e `tsconfig` fix is marked **Action needed**: the `copier update` PR that brings it needs the owner's `test-approved`. Minor version: new features, and an action for projects.
- [x] 2. Plugin `version` `0.5.0`, template `release` `v0.5.0`.
- [x] 3. `docs/HANDOFF.md`: v0.5.0 ready to publish.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The versions match the changelog | `tests/unit/release.test.ts`, `tests/unit/plugin-release.test.ts` in `npm run check` |
| The release notes print | `node scripts/release/notes.ts 0.5.0` |

## Report

- **What was done:** items 1–3.
- **Evidence:** `npm run check` green; `node scripts/release/notes.ts 0.5.0` prints the notes.
- **What was NOT verified:**
  - the release itself, which the owner publishes after the merge;
  - a whole `/adt:discover` conversation with the mockup, which comes with the owner's next real project.
- **Known limit, listed for the owner:** an adopted project (`/adt:adopt`) does not use Copier, so `copier update` does not bring it the kit changes in this release (`issues: write` on `adt-review`, `--tsconfig` in `adt-e2e`). Today it gets them only by adopting again by hand. No adopted project outside the sandboxes exists yet.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
