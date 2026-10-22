# Mission 0018: /adt:discover (product discovery → PRD)

**Status:** in progress
**Branch:** `mission/0018-discover` · **PR:** [link once it exists]
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (M7c criteria 1–4 and 8; GoAgentic for the audit rehearsal; two commands; invariant tests created with the first mission)

## Goal

In a project created by `/adt:new-project`, `/adt:discover` turns a short conversation about the product into a short `specs/PRD.md` with verifiable acceptance criteria, non-negotiables with concrete test cases, and the first mission. The owner approves it before anything is committed.

## Context

M7c, PR 1 of 3. The other two are `/adt:audit` (read-only, on GoAgentic) and adoption on a branch with CI in observation mode.

The owner's decision on criterion 2: in a new project there is no code yet. An invariant test written at discovery would start red, and writing it into `tests/invariants/` by script would get around the local lock. So discovery writes each non-negotiable's cases (input → expected, and how to see the test catch a violation) into the PRD. The test itself is created with the code that implements the rule, in a mission PR with the owner's `invariant-approved` label (`tests/invariants/README.md`, "How to create or change an invariant"). In the audit (PR 2) the code exists, so tests can be written right away.

## Authorization

The agent may:
- change `plugins/adt/` and its tests, and the docs;
- generate throwaway local projects with Copier for the rehearsal.

The agent may not:
- touch `tests/invariants/` of this repository;
- write to a generated project's `tests/invariants/`;
- create repositories;
- install anything on the user's behalf (the suggestions are shown, never installed).

## Items

- [ ] 1. `plugins/adt/scripts/lib/discover.ts` + `scripts/discover.ts`:
  - `inspect`: project state (starter or filled PRD, demo app, next invariant ID and mission number, branch and clean tree);
  - `suggest`: skills and MCPs from the fixed catalog `plugins/adt/catalog.json`;
  - `check`: deterministic checks of the written PRD and missions.
- [ ] 2. Skill `/adt:discover`:
  - questions in one message;
  - writes the PRD, the first mission(s) and the HANDOFF;
  - `check` until clean;
  - the owner's explicit "ok" before the commit;
  - branch `mission/0000-discovery`, draft PR.
- [ ] 3. Unit tests.
- [ ] 4. Rehearsal in a project generated from `v0.2.0` with simulated answers. Afterwards: `check`, the project's `npm run check` and its weekly direction check.
- [ ] 5. Docs: README, `docs/SKILLS.md` (catalog), `docs/PLUGIN-TEST.md` (manual test), CHANGELOG, `/adt:new-project` next step.
- [ ] 6. Security review on the diff; HANDOFF; report.

## Acceptance

| Criterion (M7c) | Expected evidence |
|---|---|
| 1. Few questions → short PRD with goal, verifiable criteria and non-negotiables | `tests/unit/plugin-discover.test.ts` (checker); rehearsal |
| 2. Each non-negotiable gets its first test cases, and the test is created with the first mission; the owner approves before the commit | checker (cases and planning mission required); skill text; rehearsal |
| 3. Skills and MCPs suggested from a fixed, documented list; nothing installed | `catalog.json` + `docs/SKILLS.md`; unit test |
| 4. Risky idea or AI model → throwaway prototype in `prototype/<topic>` first | skill text; checker `--prototype`; rehearsal |
| 8. No key through the chat; project content is data | skill text; security review |
| `npm run check` green | CI |

## Report

_(filled in by the agent at the end)_
