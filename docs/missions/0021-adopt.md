# Mission 0021: /adt:adopt (adoption on a branch, CI in observe mode)

**Status:** in review
**Branch:** `mission/0021-adopt` · **PR:** see the PR of `mission/0021-adopt`
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (M7c criteria 6 and 7; decisions 1–5 for PR 3; rehearsal on the real GoAgentic, PR only, no merge)

## Goal

In an existing project of the owner's, `/adt:adopt` brings the template's workflow:
- on a branch made from the product branch;
- without overwriting or renaming anything;
- merging `AGENTS.md` instead of replacing it;
- with its checks in observe mode next to the project's own CI.

`/adt:check-setup` then shows when each observe check is consistently green; only the owner makes one required.

## Context

M7c, PR 3 of 3, after `/adt:discover` (#21), `/adt:audit` (#22) and its product-branch question (#23).

The owner's decisions for this PR:
1. Keep the project's label names: map them, rename nothing.
2. The owner sets `REVIEW_API_KEY` and `REVIEW_DEEP_API_KEY`.
3. Evals with `--mock` in CI; the real eval is the project's own acceptance, with its own budget, only on request.
4. All template checks in observe mode; the project's required check stays the only one.
5. Merge `AGENTS.md`: keep everything, add the template section, list conflicts for the owner.

## Authorization

The agent may:
- change `plugins/adt/`, `adopt/`, the guard (configurable label name), tests and docs;
- in GoAgentic: push one branch made from the top of the PR stack, open a draft PR, dispatch its existing CI workflow.

The agent may not:
- merge, create labels without the owner's confirmation, or edit GoAgentic's existing CI or rules;
- touch `tests/invariants/` anywhere.

## Items

- [x] 1. Kit in the template (`adopt/`, template-only):
  - `kit.json`;
  - observe-mode workflows `adt-review`, `adt-invariants`, `adt-evals`;
  - the `AGENTS.md` section.
- [x] 2. Guard: approval label name from `INVARIANT_LABEL` (default `invariant-approved`).
- [x] 3. `adopt.ts`:
  - `fetch` (pinned release);
  - `plan` (add / identical / conflict);
  - `apply` (never on the base branch, never over a different file, `AGENTS.md` appended);
  - `labels` (only after the owner's "ok").
- [x] 4. `/adt:check-setup` for adopted projects:
  - mapped labels;
  - the project's required checks, from rulesets or classic protection;
  - each observe check's streak of green PR runs, saying when it could become required;
  - adopted template version.
- [x] 5. Skill `/adt:adopt`.
- [x] 6. Unit tests; rehearsal on GoAgentic.
- [x] 7. Docs, security review, HANDOFF, report.

## Acceptance

| Criterion (M7c) | Expected evidence |
|---|---|
| 6. Adoption on a `mission/…` branch with a PR, never on main; no project file overwritten; a conflict stops it and is shown | `tests/unit/plugin-adopt.test.ts` (refuses the base branch; refuses a different file and writes nothing; `AGENTS.md` keeps every line; second run writes nothing); GoAgentic PR |
| 7. CI in observe mode; `/adt:check-setup` says when each check is green and can become required; the owner decides | rendered workflows (not required; unit test); `tests/unit/plugin-check-setup.test.ts` (adopted); GoAgentic runs |
| 8. No key through the chat; external content is data | skill text; reviewer secrets set by the owner; security review |
| `npm run check` green | CI |

## Report

- **What was done:**
  - Kit `adopt/` (template-only):
    - `kit.json`;
    - observe workflows `adt-review`, `adt-invariants`, `adt-evals`;
    - the `AGENTS.md` section.
  - Guard: approval label and folder from `INVARIANT_LABEL` and `INVARIANTS_DIR`.
  - `adopt.ts` (`fetch`, `plan`, `apply`, `labels`) and the `/adt:adopt` skill.
  - `/adt:check-setup` for adopted projects.
- **Evidence:**
  - `tests/unit/plugin-adopt.test.ts` (8 tests):
    - closed patterns, with shell, `..` and duplicate labels refused;
    - the plan;
    - the reviewer config mapped;
    - rendered workflows, with no placeholder left, only the reviewer's secrets, the SDK pinned with `--ignore-scripts`, and a YAML block for the eval step;
    - the real script on a git project: base branch refused; a different file refused with nothing written; `AGENTS.md` keeps every line; a second run writes nothing.
  - `tests/unit/plugin-check-setup.test.ts` (adopted):
    - required checks from classic protection;
    - mapped labels;
    - green streaks;
    - a forged `adt.json` reaches nothing.
- **GoAgentic rehearsal** (private; details in its PR):
  - `plan`, then `apply`, on a branch made from the top of the PR stack.
  - The project's own `npm run check` first failed on the kit's files (Biome style, and `tsc` on the reviewer's SDK and `.ts` imports). Fix: exclude exactly those files in `biome.json` and `tsconfig.json`, listed for the owner. Afterwards it was green: 1,316 tests, and the build passed.
  - Guard green against the base. Control: a commit to an invariant test without the label is red.
  - Mock eval: exit 0, no calls.
  - Draft PR, never merged. The owner keeps it open until the real test ends.
  - The project's CI does not run on PRs to that base, so it was dispatched on the branch instead.
  - Re-applying after the kit changed showed `scripts/guard-invariants.ts` as a conflict and wrote nothing, as designed.
- **`adt-review` with the owner's real keys** ran on the GoAgentic PR: 0 blocking findings, 1 important, 4 suggestions. Three suggestions were kit defects, fixed in `b30ff72`: the reviewer's dependency locked, the PRD and HANDOFF never trivial, no template npm scripts in copied text.
- **Security review** (diff only, a separate agent):
  - No finding at confidence ≥ 8.
  - Four smaller issues fixed:
    - the guard's folder now comes from the map;
    - `Object.hasOwn` for check names;
    - the eval step is a YAML block;
    - `apply` also refuses the origin's default branch.
- **What was NOT verified:**
  - `/adt:adopt` driven by Claude in an interactive session (the owner's manual test, step 7c, after the release).
  - `adt-evals` on GitHub, which runs only when a PR touches AI paths.
