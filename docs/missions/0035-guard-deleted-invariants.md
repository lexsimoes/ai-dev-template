# Mission 0035: regression test, a PR that deletes the invariants folder

**Status:** in review
**Branch:** `mission/0035-guard-deleted-invariants` · **PR:** see the PR of `mission/0035-guard-deleted-invariants`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("Add the guard regression test for a PR that deletes tests/invariants/.")

## Goal

The invariant guard's fix for a project with no invariants folder yet (mission 0032, #38) can never turn into a way to delete the folder: a test proves that deleting it fails.

## Context

#38 made the guard treat a missing folder as "no tests", so a just-adopted project is not red on every PR. Its review asked whether a PR could then delete `tests/invariants/` and pass. It cannot (the deleted files show in the diff, and the count drops), but no test said so.

## Authorization

The agent may add a test to `tests/unit/guard-invariants-config.test.ts` and update this mission and `docs/HANDOFF.md`. It may not touch `tests/invariants/` or `scripts/guard-invariants.ts`.

## Items

- [x] 1. Test: on a repository whose target branch has `tests/invariants/`, a PR that deletes the whole folder fails without the label, listing the deleted file and the drop to 0. With the label in the payload but no way to check who applied it, it fails too.
- [x] 2. Update `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Deleting the folder fails without the label | `tests/unit/guard-invariants-config.test.ts`, the new test |
| The label alone, unverified, does not let it through | the same test |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–2.
- **Evidence:** the new test passes against the current guard; `npm run check` green locally and in CI ([`quality`](https://github.com/lexsimoes/ai-dev-template/actions/runs/40038047721/job/120702468101), [`invariants`](https://github.com/lexsimoes/ai-dev-template/actions/runs/40038047721/job/120702468516)).
- **What was NOT verified:** the label applied by the CODEOWNERS owner on a deletion; that case is the existing "label applied by the CODEOWNERS owner passes" test.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
