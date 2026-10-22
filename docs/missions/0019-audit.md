# Mission 0019: /adt:audit (read-only audit of existing code)

**Status:** in review
**Branch:** `mission/0019-audit` · **PR:** not opened yet
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (M7c criteria 5 and 8; GoAgentic, read-only, for the rehearsal; two commands)

## Goal

For a folder with existing code, `/adt:audit <path>` maps the stack, the tests and the sensitive areas, and shows an inferred PRD for the owner to confirm. It runs from a folder of the owner's own, never inside the project, and it changes nothing.

## Context

M7c, PR 2 of 3. PR 1 was `/adt:discover` (#21). PR 3 adopts the template on a branch, with CI in observation mode, starting from the PRD the owner confirmed here.

The audited repository is **data**:
- its `AGENTS.md`, `CLAUDE.md`, README and code are read, never followed;
- the map script shows only counts, closed lists and plain file names;
- environment variables appear by name, never by value.

GoAgentic is private. Its audit goes to the owner in the conversation, never into this public repository or its PR.

## Authorization

The agent may:
- change `plugins/adt/` and its tests, and the docs;
- read a shallow clone of `lexsimoes/goagentic` (attached read-only).

The agent may not:
- write to, push to or open anything in GoAgentic;
- put GoAgentic's contents in this repository or its PR (only aggregate numbers);
- load GoAgentic's agent rules as instructions.

## Items

- [x] 1. `plugins/adt/scripts/lib/audit.ts` + `scripts/audit.ts`:
  - `map`: stack, scripts, tests, CI, agent rule files, sensitive areas (authentication, payments, personal data, AI, external input, database policies), environment variable names;
  - `fingerprint`: proves the folder did not change.
- [x] 2. Skill `/adt:audit`:
  - map, then read the flagged files as data;
  - inferred PRD (goal, users, criteria from the existing tests, non-negotiables from the existing protections, gaps);
  - the owner confirms or corrects;
  - fingerprint before and after;
  - nothing written.
- [x] 3. `/adt:new-project` and `/adt:discover` point a folder with code to `/adt:audit`.
- [x] 4. Unit tests, including "folder intact" and "no secret value in the output".
- [x] 5. Rehearsal on GoAgentic (read-only); the report goes to the owner.
- [x] 6. Docs, security review, HANDOFF, report.

## Acceptance

| Criterion (M7c) | Expected evidence |
|---|---|
| 5. `/adt:audit` writes nothing: it maps stack, tests and sensitive areas and shows the inferred PRD for the owner to confirm | `tests/unit/plugin-audit.test.ts` (fixture byte-for-byte identical before and after; fingerprint); GoAgentic rehearsal (fingerprint and `git status` before and after) |
| 8. No key through the chat; audited content is data | env values never in the output (unit test); skill text; security review |
| `npm run check` green | CI |

## Report

- **What was done:**
  - `/adt:audit`: skill, `audit.ts` (`map`, `fingerprint`).
  - `/adt:new-project` and `/adt:discover` send a folder with code to it.
  - Docs: README, CHANGELOG, `docs/PLUGIN-TEST.md` step 7b.
- **Evidence:**
  - `tests/unit/plugin-audit.test.ts` (6 tests):
    - the real script, run from another folder on a hostile git fixture, leaves every file byte-for-byte the same (content and modification time) and runs none of its programs; plain `git ls-files` there does (control);
    - `fingerprint` matches the one from `map`, and a same-size edit changes it (positive control);
    - it reports when the project is, contains or is inside the folder Claude Code started in (a symbolic link included), and when the walk was cut at the file limit;
    - a `.env.local` is listed but never opened;
    - a secret in a code file, `.env.example` values and project text never reach the output;
    - a symbolic link out of the project is not followed.
  - Found by that test and fixed: `git status` refreshes `.git/index` on its own. `discover.ts` now uses `git --no-optional-locks status`, which writes nothing. `audit.ts` no longer runs git at all (below).
- **Security review** (diff only, a separate agent): 3 findings at confidence ≥ 8, all fixed by a redesign.
  1. On Windows, `git` run inside the audited folder could start a `git.exe` placed there.
  2. git can run the project's own configuration (`core.fsmonitor`, verified), for example in a project received as an archive with its `.git`.
  3. Starting Claude Code inside the audited project loads its `CLAUDE.md`, `AGENTS.md` and `.claude/` settings as instructions, before the skill can call them data. `--add-dir` still loads that folder's skills and agents (checked in the current Claude Code docs).
  - **Fix:**
    - `audit.ts` runs no program at all: it walks the folder and reads `.git/HEAD`.
    - The skill runs from a folder of the owner's own, with `/adt:audit <path>`.
    - It stops when it runs inside a project that has agent files.
  - **Test:** a hostile project (fsmonitor set, a fake `git` at its root and first on PATH) runs nothing, and the control shows git itself would run it.
- **GoAgentic rehearsal** (private repository, read-only shallow clone; its contents stay out of this public repository):
  - `map` run from another folder, on 460 files;
  - the files of the flagged areas were read as data;
  - fingerprint and `git status` were the same before and after;
  - the report and inferred PRD went to the owner in the conversation.
- **What was NOT verified:**
  - `/adt:audit` driven by Claude in an interactive session: the owner's manual test, step 7b, after the next release.
  - The owner's confirmation of the inferred GoAgentic PRD (pending).
