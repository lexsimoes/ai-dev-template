# Mission 0039: a new model backend warns and opens an issue

**Status:** in review
**Branch:** `mission/0039-fingerprint-issue` · **PR:** see the PR of `mission/0039-fingerprint-issue`
**Created on:** 2026-10-24 · **Approved by the owner on:** 2026-10-24 ("a fingerprint change only warns and opens an issue, a model-name change blocks (as it does now)")

## Goal

When the provider ships a new backend under the same pinned model name (for example a newer DeepSeek-V4.1-Flash), someone finds out and measures it, without stopping every review.

## Context

- Mission 0033 pinned each tier's version. A new model name stops the review. A new fingerprint (DeepSeek's `system_fingerprint`) only added a note, which nobody may read.
- DeepSeek has no dated model ids, so a same-name release shows only as a new fingerprint (M8 report, known limits).

## Authorization

The agent may change:
- `scripts/review/run.ts` and `scripts/review/lib.ts` (comments only), with their tests;
- `issues: write` on the reviewer jobs (`review.yml`, `review-canary.yml`, the kit's `adt-review.yml`);
- the `$comment` of `.github/review.json` and its twin;
- the docs.

## Items

- [x] 1. On a new fingerprint, the report warns (⚠️). The reviewer opens one issue per new fingerprint, or points to the open one. The issue holds the pinned and new fingerprints, the run, and the steps (run the canary; update the pin in a PR, or choose another model with the owner). It needs no PR, so the monthly canary reports it too. Locally and in a dry run, no issue is opened.
- [x] 2. A failure to open the issue is a note, never a red check. A new model name still stops the review.
- [x] 3. `issues: write` on the reviewer jobs, plus `GITHUB_TOKEN` on the canary.
- [x] 4. Docs: `docs/WORKFLOW.md`, the `$comment` of `.github/review.json` and its twin, `CHANGELOG.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A new fingerprint warns and opens one issue; the same fingerprint is not reported twice; the review goes on | `tests/unit/review-flow.test.ts`, "pinned version…" |
| An issue that cannot be opened (HTTP 403) never changes the result | same test |
| A new model name still stops the review before a call | same test (unchanged assertions) |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–4.
- **Evidence:** `tests/unit/review-flow.test.ts`, with a fake GitHub API and a fake provider whose fingerprint changes; `npm run check`.
- **What was NOT verified:** a real fingerprint change at DeepSeek. The pinned fingerprint matched on every run of this round.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none. The fingerprint comes from the provider's reply, so it reaches the issue only in a closed format (letters, digits, `_.:-`, up to 100 characters); any other value opens no issue.
