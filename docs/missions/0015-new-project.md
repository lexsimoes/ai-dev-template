# Mission 0015: /adt:new-project, sandbox rehearsal, manual install test

**Status:** in review
**Branch:** `mission/0015-new-project` · **PR:** https://github.com/lexsimoes/ai-dev-template/pull/18
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
- [x] 4. Sandbox rehearsal `adt-sandbox-m7b` (also closes the M7 gap "generated project CI in its own GitHub repository").
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

- **What was done:**
  - Plugin renamed `adt`; plugin paths are sensitive; `/adt:new-project` (inspect, preflight, create, idempotent setup); manual test `docs/PLUGIN-TEST.md`.
  - A gap found by the rehearsal and fixed: new repositories need the dependency graph, or the required `dependencies` check fails; `setup` now turns it on and `check-setup` checks it.
- **Sandbox rehearsal** (`lexsimoes/adt-sandbox-m7b`, public, no-key mode):
  - `inspect`, `preflight` and `create` ran in an empty folder (Copier from `v0.1.0`, first commit).
  - Creating the repository is not possible from the agent's cloud session (its GitHub access is limited to repositories attached to the session). The owner ran the same creation with `gh repo create lexsimoes/adt-sandbox-m7b --public`.
  - `setup` then pushed `main` and created the 5 labels.
  - The dependency graph and the ruleset endpoints are also blocked from the session. The owner ran the same two calls `setup` makes: `PUT vulnerability-alerts` and `POST rulesets --input protect-main.json`. GitHub accepted the ruleset file as is: 5 required checks tied to GitHub Actions, no bypass.
  - A second `setup` returned `exists` for repository, labels, dependency graph and ruleset.
  - CI on `main` was green in the project's own repository (closes the M7 gap).
  - On test PR lexsimoes/adt-sandbox-m7b#1 (touches an AI file): `review` and `evals` passed with the "off" notice (no-key mode on real GitHub), `quality` and `invariants` passed, `dependencies` failed until the dependency graph was on and passed on the re-run. `mergeable_state: clean`.
  - `/adt:check-setup` on the sandbox: all green (secrets not listable from the session).
- **What was NOT verified:**
  - `/adt:new-project` and `/adt:check-setup` driven by Claude inside an interactive session, including the `allowed-tools` pre-approval (owner's manual test).
  - The script's own `gh repo create` step and the private + Free plan path on a real account.
- **Pending decisions for the owner:** delete `adt-sandbox-m7b` after reviewing; whether test PR #1 there should stay open.
- **Possible injections found in external content:** none.
