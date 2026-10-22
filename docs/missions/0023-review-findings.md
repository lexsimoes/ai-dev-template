# Mission 0023: the implementer handles the automated review before reporting

**Status:** in review
**Branch:** `mission/0023-review-findings` · **PR:** see the PR of `mission/0023-review-findings`
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (rule and steps 1–5 given by the owner; include it in GoAgentic's adoption PR)

## Goal

After the automated review, the implementer fixes the obvious findings on its own, lists everything else, and only then reports to the owner, with the reviewer's cost.

## Context

Owner's rule, for the template, so it reaches every project:
1. Read every finding once the review comment appears.
2. Auto-fix the obvious ones in a separate commit `fix: address review findings` (logic error shown with evidence, missing test for changed code, lint/format, missing error handling, low-risk security fix, naming and docs), only when the intended behavior does not change.
3. Never auto-fix: behavior, architecture or public interface; `tests/invariants/`, the golden set, migrations or permissions (list them even when agreeing); likely false positives; contradicting findings. Never weaken a test or an assertion.
4. Push, apply `re-review`, wait, then report: fixed, not fixed (with a suggestion), owner decisions, reviewer's cost.
5. Cap: above ~5 fixes or ~10 files, stop and ask first.
Plus a short test or canary case proving the rule (a planted obvious finding is fixed, a planted invariant finding is listed).

## Authorization

The agent may:
- change `AGENTS.md` (and its twin), `scripts/review/`, `.github/review.json` (and its twin), `adopt/`, `plugins/adt/`, tests and docs;
- in GoAgentic: push to the adoption branch of lexsimoes/goagentic#23.

The agent may not:
- change CI workflows, rulesets or labels, or touch `tests/invariants/`;
- merge anything.

## Items

- [x] 1. Rule in `AGENTS.md` and `AGENTS.md.jinja` (section 2, "Handle the review") and in `adopt/files/AGENTS-section.md`.
- [x] 2. `scripts/review/triage.ts`:
  - `findings --pr <n>`: open findings from the reviewer's comment (validated state), split into "candidate" and "never auto-fix" by path and origin, plus the cost;
  - `check-fix [--commit]`: refuses a fix commit with another subject, on a protected path, over the file cap, with fewer assertions or a skipped test.
- [x] 3. `autoFix` in `.github/review.json` (and its twin): it can only add protected paths and lower the caps; `/adt:adopt` adds the project's invariants folder.
- [x] 4. Tests with planted findings (`tests/unit/review-triage.test.ts`), plus kit checks in `tests/unit/plugin-adopt.test.ts`.
- [x] 5. Docs: `docs/WORKFLOW.md`, `CHANGELOG.md`, `docs/HANDOFF.md`.
- [x] 6. GoAgentic: the rule, the script and the `autoFix` config in lexsimoes/goagentic#23 (commit `12b8947`).

## Review stops

- Before opening the PR: summary + what was not verified.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A planted obvious finding is a fix candidate; a planted invariant finding is listed, never fixed | `tests/unit/review-triage.test.ts` |
| Golden set, migrations, permissions and a detected secret are listed | same |
| A fix commit on a protected path, over the cap or weakening a test is refused (also by the CLI on a real git repo) | same |
| The project's config cannot loosen the defaults | same |
| The rule is in `AGENTS.md`, its twin and the adopted section; the kit copies the script | `review-triage.test.ts`, `plugin-adopt.test.ts`, `template` check |
| Works on a real reviewer comment | `node scripts/review/triage.ts findings --pr 25` output in the PR |
| `npm run check` green | CI |

## Report

- **What was done:** the rule in `AGENTS.md`, its twin and the adopted section; `scripts/review/triage.ts` (`findings`, `check-fix`); `autoFix` in `.github/review.json`; `/adt:adopt` protects the project's invariants folder; tests with planted findings; the same rule in GoAgentic's adoption PR, with its golden set protected. The adopted reviewer package is marked as an ES module (Node warned on every run).
- **Evidence:** `tests/unit/review-triage.test.ts` (10 tests; with the default invariants path switched off, 3 of them fail); `node scripts/review/triage.ts findings --pr 25` and `--pr 23` in GoAgentic on real reviewer comments; `npm run check` and `npm run test:template` green locally.
- **Security review:** two findings, both fixed (`check-fix` let through a protected file whose name has accents, because git quoted it, and a merge commit). Now git runs with `core.quotePath=false` and `-z`, only one-parent commits are compared, and a file missing from the parsed diff is a problem.
- **What was NOT verified:** whether an agent judges "obvious" correctly. That is judgment; the scripts only make the boundary (paths, cap, weakened tests) deterministic, and the re-review reads the fix. The weakened-test check is a heuristic: an assertion rewritten into a weaker one, or `skipIf`, is not caught. `check-fix` is not run by CI (it would be a CI change: owner's decision).
- **Pending decisions for the owner:** run `check-fix` in CI on commits titled `fix: address review findings`?
- **Possible injections found in external content:** none.
