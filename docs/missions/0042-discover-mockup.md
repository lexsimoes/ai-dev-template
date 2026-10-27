# Mission 0042: a clickable mockup in discovery, and end-to-end tests written apart from the code

**Status:** in review
**Branch:** `mission/0042-discover-mockup` · **PR:** see the PR of `mission/0042-discover-mockup`
**Created on:** 2026-10-27 · **Approved by the owner on:** 2026-10-27 (a mockup after the interview; the end-to-end tests of a feature come from a separate mission, written from the acceptance criteria, preferably by another agent or before the code; then "let's go on", all translated from Portuguese)

## Goal

Before any code, the owner clicks through the main flow and corrects it. The end-to-end tests that check the flow come from the acceptance criteria, apart from the code they test.

## Context

- During the first real use (a new AI-consultant site), the owner asked for a mockup right after the discovery interview. Its purpose: confirm that what is being built makes sense, before building it.
- The owner also asked whether the tester should use another model than the reviewer. Running the tests uses no model. Writing them does: the Playwright agents use Claude Sonnet. The independence that matters most is where the tests come from (the acceptance criteria, before the code) and who writes them (not the implementer, when another agent is available).

## Authorization

The agent may change:
- the `discover` skill, `plugins/adt/scripts/discover.ts` and `lib/discover.ts`, with tests;
- `AGENTS.md` and its twin (one bullet in Evidence), and the section adopted projects get (`lib/adopt.ts`);
- `README.md`, `CHANGELOG.md` and `docs/HANDOFF.md`.

## Items

- [x] 1. `/adt:discover` step 2b: for a product with screens, a clickable mockup in `prototype/mockup/` before the PRD.
  - Plain HTML, one page per step of the main flow, fake data, in the product's language.
  - Marked as a mockup on every page.
  - No scripts and nothing from the network.
  - The user's changes go into the criteria, in at most 3 rounds. It is committed with the discovery PR as a throwaway reference.
- [x] 2. `discover.ts mockup` checks it: `index.html`, the marker, no scripts, nothing remote (src, href, form action, `url()`, `@import`), every link leads to a page that exists.
- [x] 3. An AI model at the center: the throwaway prototype runs it on about 10 real examples, which become the first golden-set cases.
- [x] 4. A separate mission "End-to-end tests of <the main flow>":
  - its plan in `specs/e2e/`, from the CA-xx, before the code;
  - its tests written by the Playwright agents after the code is merged, by another agent than the implementer when one is available.

  `discover.ts check --e2e` requires that mission, its plan and its criteria.
- [x] 5. The rule in `AGENTS.md` and its twin (Evidence), and in the section adopted projects get.
- [x] 6. README, CHANGELOG, HANDOFF.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A mockup that loads anything remote, runs a script, is not marked, or links to a missing page is refused | `tests/unit/plugin-discover.test.ts`, "mockup…"; the `discover.ts mockup` command on a sample mockup (a missing page is reported, then it passes) |
| A product with screens needs a separate end-to-end test mission, with a plan in `specs/e2e/` and its CA-xx | same file, "a product with screens…" |
| The rule reaches new and adopted projects | same file, "the skill and the rules carry it…" |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–6.
- **Evidence:**
  - `tests/unit/plugin-discover.test.ts` (3 new tests);
  - `discover.ts mockup` run on a sample mockup: a missing page is reported, then it passes;
  - `npm run check`.
- **What was NOT verified:**
  - a whole `/adt:discover` conversation with the mockup in Claude Code; it comes with the next real project;
  - the guide row of `/adt:discover` (`plugins/adt/GUIDE.md`, mission 0041, #49) gets the mockup once #49 is merged.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
