# Mission 0014: Claude Code plugin, marketplace and /check-setup

**Status:** in review (done, waiting for the owner's merge)
**Branch:** `mission/0014-plugin-check-setup` · **PR:** https://github.com/lexsimoes/ai-dev-template/pull/17
**Created on:** 2026-10-21 · **Approved by the owner on:** 2026-10-21 (M7b brief, items 2, 4 and 5)

## Goal

Claude Code users install the template's plugin from this repository and check a project's setup with one command, which says how to fix each problem.

## Context

Second PR of M7b. `/ai-dev:new-project` comes in the next PR. Plugin and marketplace structure follow the Claude Code docs read on 2026-10-21 (code.claude.com/docs/en/plugins/marketplace-reference, manifest-reference, skills, plugins/loading): the plugin is copied into a cache on install, so it must be self-contained; plugin skills are namespaced (`/ai-dev:check-setup`).

## Authorization

The agent may: add `.claude-plugin/`, `plugins/ai-dev/`, their tests, the two bridge files, and docs. It may not: change GitHub settings, read secret values, or run fixes for the user.

## Items

- [x] 1. Marketplace (`.claude-plugin/marketplace.json`) and plugin `ai-dev` (`plugins/ai-dev`), pinned to a template release (`template.json`).
- [x] 2. `/ai-dev:check-setup`: gh login, repository, labels, ruleset with the required checks (and the private/Free case), secrets by name, reviewer and evals config versus the keys (or no-key mode), CI on `main`, template version and update.
- [x] 3. Bridge files only where needed (Gemini CLI, Aider), pointing to `AGENTS.md`.
- [x] 4. Tests; plugin validated and installed with the `claude` CLI.
- [x] 5. Docs, CHANGELOG, HANDOFF.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Each check: pass/fail and how to fix it | `tests/unit/plugin-check-setup.test.ts` (fake `gh`) |
| Secrets by name only; keys never through the chat or `!` | check code lists names; fix texts tested |
| Plugin pinned to the newest release; self-contained once installed | `tests/unit/plugin-release.test.ts` |
| Valid plugin and marketplace; installs from the marketplace | `claude plugin validate`; `claude plugin install` output in the PR |
| Bridges point to `AGENTS.md` without copying it | `.gemini/settings.json`, `.aider.conf.yml`; template test checks they reach projects |
| `npm run check` green | CI |

## Report

- **What was done:** marketplace and plugin `ai-dev` pinned to `v0.1.0`; `/ai-dev:check-setup` with a fix for each problem; bridges for Gemini CLI and Aider; release flow covers the plugin; hardening from the security review.
- **Evidence:** `tests/unit/plugin-check-setup.test.ts`, `tests/unit/plugin-release.test.ts`; `claude plugin validate` passed; install from a local marketplace copy and a run from the installed cache copy (outputs in the PR).
- **What was NOT verified:** the skill invoked inside an interactive Claude Code session; install from GitHub (after the merge); secrets listing on a real project (proxy-blocked here).
- **Pending decisions for the owner:** none blocking (plugin name `ai-dev`).
- **Possible injections found in external content:** none.
