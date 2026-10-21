# Mission 0013: template releases

**Status:** in review
**Branch:** `mission/0013-releases` · **PR:** _(link once it exists)_
**Created on:** 2026-10-21 · **Approved by the owner on:** 2026-10-21 (M7b brief, item 1)

## Goal

Projects are created and updated from versioned releases of the template, never from `main`.

## Context

M7b (Claude Code plugin as the single entry point) needs a pinned release to generate projects from, and `copier update` needs versions. First PR of M7b; the owner creates or approves the first release (`v0.1.0`).

## Authorization

The agent may: add `CHANGELOG.md`, `docs/RELEASING.md`, `scripts/release/` and their tests; point the docs at release tags; add the "no tags or releases" rule to `AGENTS.md`.

The agent may not: create tags or releases (the owner does), change rulesets or repository settings.

## Items

- [x] 1. Tagging scheme (semver `vX.Y.Z`, first `v0.1.0`) and what counts as patch/minor/major for a template.
- [x] 2. `CHANGELOG.md` with `[Unreleased]` and `[0.1.0]`; `scripts/release/notes.ts` checks the changelog and prints a version's notes.
- [x] 3. `docs/RELEASING.md`: day to day, release PR, the owner's exact commands, release immutability, bad releases.
- [x] 4. Docs and Copier use the latest release (no `--vcs-ref HEAD`).
- [x] 5. Update `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Copier without `--vcs-ref` uses the latest release tag, not unreleased commits; `copier update` moves a project to the next release | `tests/template/template.test.ts`, "releases" |
| The changelog is ready for its newest version; the notes script fails with the reason otherwise | `tests/unit/release.test.ts` |
| Release files are template-only | `copier.yml` `_exclude`; template test |
| Agents never tag or release | `AGENTS.md` 1.7 (and the twin) |
| `npm run check` green | CI |

## Report

_(filled in at the end, in the PR)_
