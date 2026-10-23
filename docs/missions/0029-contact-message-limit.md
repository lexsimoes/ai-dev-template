# Mission 0029: contact message limit (issue #33)

**Status:** in review
**Branch:** `mission/0029-contact-line-breaks` · **PR:** see the PR of `mission/0029-contact-line-breaks`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("issue → failing e2e test → fix, one PR. Normalize line endings on both sides so the browser and server count the same way, and state the limit the same way in both.")

## Goal

A contact message within the limit the page states is always sent; the browser, the server and the messages count it the same way.

## Context

The rehearsal of the exploratory session (mission 0028) found that a 1,990-character message with 221 line breaks is refused as "longer than 2,000 characters": the browser counts a line break as one character, the form sends it as CRLF, and the server counted two. While writing the test, a second case of the same kind showed up: 2,000 characters of Japanese text take 18 KB once form-encoded, over the 16 KB body limit, so they were refused with 413.

## Authorization

The agent may open the issue with `scripts/explore-report.ts`, add a new end-to-end spec (no label: a new spec), change `src/web/app.ts` (counting, body limit, texts), add unit tests, and update the e2e plan and docs.
The agent may not change existing specs, `e2e/fixtures.ts` or `playwright.config.ts`.

## Items

- [x] 1. Issue #33, opened by `scripts/explore-report.ts` from the rehearsal's session file: branch `exploration/2026-10-23-contact-form` with the screenshot and `REPORT.md`.
- [x] 2. New spec `e2e/contact-message-limit.spec.ts` (plan 3.3 in `specs/e2e/critical-flows.md`), committed first and failing ("line breaks": no `?sent=1`).
- [x] 3. Fix in `src/web/app.ts`:
  - CRLF and CR become LF before counting and storing;
  - the body limit is sized from the message limit (9 bytes per character once form-encoded, plus 1 KB);
  - one stated limit, "2,000 characters (a line break counts as one)", on the page and in the error, which also says how many characters the message has.
- [x] 4. Unit tests in `tests/unit/web.test.ts`; `CHANGELOG.md`, `docs/HANDOFF.md`.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The issue exists, with steps and the screenshot | #33 |
| The new test fails before the fix, passes after | local runs (in the PR) and the `e2e` check |
| 2,000 characters with line breaks, or in any alphabet, are sent | the e2e spec; `tests/unit/web.test.ts` |
| Above the limit: 422, the limit stated as on the page, the text kept | `tests/unit/web.test.ts` |
| The browser keeps the same limit | the e2e spec (2,001 filled, 2,000 kept) |

## Report

- **What was done:** items 1–4.
- **Evidence:**
  - Issue #33: the branch holds only the screenshot and `REPORT.md`, and the image link answers 200.
  - Before the fix, `e2e/contact-message-limit.spec.ts` fails with "line breaks: expect(page).toHaveURL" (Playwright, local Chromium). After the fix, all 7 specs pass.
  - `tests/unit/web.test.ts`: 10 tests pass.
- **What was NOT verified:**
  - Locally, the specs ran with the container's preinstalled Chromium through a config that extends the project's own (outside the repository). CI uses the pinned browser.
  - The first publish attempt failed with HTTP 401: Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set, and this container reaches GitHub only through a proxy. The rerun with that variable opened the issue, as the rerun rule allows. A machine without a proxy is not affected.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
