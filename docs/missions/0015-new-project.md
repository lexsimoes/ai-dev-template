# Mission 0015: /adt:new-project, sandbox rehearsal, manual install test

**Status:** in progress
**Branch:** `mission/0015-new-project` · **PR:** _(link in the PR)_
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-21 (M7b brief, items 3 and 6) and 2026-10-22 (rename to `adt`, plugin paths sensitive)

## Goal

In Claude Code, `/adt:new-project` in an empty folder creates a project from the pinned template release and sets it up on GitHub, without keys ever passing through the conversation.

## Authorization

The agent may: change `plugins/adt/` and its tests, docs; create **one** public repository `lexsimoes/adt-sandbox-m7b` through the command's own flow (the owner deletes it after reviewing).

The agent may not: read or ask for API keys; create other repositories; delete the sandbox.

## Items

- [x] 1. Rename the plugin to `adt`; `plugins/**` and `.claude-plugin/**` are sensitive paths.
- [x] 2. `/adt:new-project`:
  - inspect: empty / project from this template / other code (stop);
  - preflight;
  - questions in one message;
  - Copier non-interactive from the pinned release;
  - idempotent GitHub setup: repository and push, labels, ruleset (private and plan check);
  - keys set by the user in a separate terminal (`!` is not used: its output goes into the conversation, and hidden prompts there are not documented);
  - summary: created, pending, next step.
- [x] 3. Unit tests for the scripts.
- [ ] 4. Sandbox rehearsal `adt-sandbox-m7b` (also closes the M7 gap "generated project CI in its own GitHub repository").
- [x] 5. Manual install test for the owner's Mac: `docs/PLUGIN-TEST.md`.
- [ ] 6. Security review on the diff; HANDOFF; report.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Empty folder → project from the pinned release; code folder → stop, nothing changed | `tests/unit/plugin-new-project.test.ts`; local run of `create` |
| Setup idempotent; never overwrites | unit tests (second run creates nothing); sandbox rerun |
| Private repository: plan checked, explained, continues; flagged by check-setup | unit tests (`setupRuleset`, `checks.ts`) |
| Keys never through the chat | skill text; scripts only list secret names |
| Generated project CI green in its own repository | sandbox Actions runs |
| `npm run check` green | CI |

## Report

_(filled in at the end)_
