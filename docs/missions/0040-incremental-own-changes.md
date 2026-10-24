# Mission 0040: the incremental review sees only the PR's own changes

**Status:** in review
**Branch:** `mission/0040-incremental-own-changes` · **PR:** see the PR of `mission/0040-incremental-own-changes`
**Created on:** 2026-10-24 · **Approved by the owner on:** 2026-10-24 ("diff only what the PR's own commits changed (merge-base), not what came in from the base. Open it as the first task for the next version.")

## Goal

After a PR merges its base, the `re-review` review reports only what the PR's own commits changed since the last review.

## Context

- The incremental diff ran from the last reviewed commit to the new head. It was then filtered to the files the PR changes.
- A base merge that touches one of those files brought the base's lines into the diff. On #45, after #46 was merged into `main` and `main` was merged into #45, the reviewer reported #46's changelog and HANDOFF lines as an unrelated change in #45 (a false positive).
- The M8 report lists the related limits of the incremental review.

## Authorization

The agent may change `scripts/review/run.ts` and its tests, `docs/WORKFLOW.md`, `CHANGELOG.md` and `docs/HANDOFF.md`.

## Items

- [x] 1. The incremental review starts from the last reviewed commit merged (`git merge-tree --write-tree`) with the base the PR has now (`git merge-base head base`).
  - Without a base merge, that is the reviewed commit, as before.
  - With one, the base's changes are already on both sides, so they leave the diff.
  - The rename detection uses the same starting point.
- [x] 2. A conflicting base merge falls back to every change since the reviewed commit, with a note: the PR resolved the conflict by hand, so its resolution is the PR's own change.
- [x] 3. Test in `tests/unit/review-flow.test.ts`: a base line in the shared changelog is left out; a conflicting merge falls back with the note. The test fails on the previous reviewer.
- [x] 4. Docs: `docs/WORKFLOW.md` (the limit is gone), `CHANGELOG.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| After a base merge, the base's lines in a shared file are not in the incremental diff; the PR's own change is | `tests/unit/review-flow.test.ts`, "after the PR merges its base…" |
| A conflicting merge shows every change since the review, with a note | same test |
| Without a base merge, nothing changes | the existing incremental tests |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–4.
- **Evidence:** the new test passes and fails on the previous reviewer (the base's changelog line was in the diff); the 16 other review-flow tests still pass.
- **What was NOT verified:** a real PR on GitHub after a base merge. That comes with the next `re-review` after a base merge. `git merge-tree --write-tree` needs git 2.38 or newer; the GitHub runners have 2.55, and this container has 2.43.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
