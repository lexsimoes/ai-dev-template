# Mission 0041: the adt commands, shown where the user starts

**Status:** in review
**Branch:** `mission/0041-adt-guide` · **PR:** see the PR of `mission/0041-adt-guide`
**Created on:** 2026-10-27 · **Approved by the owner on:** 2026-10-27 ("assim que iniciar o projeto chamando o template, além da entrevista, no início mostra os passos a seguir pra falar como os /adt funcionam e como chamar e quando chamar")

## Goal

Someone starting a project knows, before the first question, which adt command comes when, where to run it and what they do after it.

## Context

During the first real use (a new AI-consultant site), the owner found that nothing showed the whole path. Each skill only names the next step at its end. The README lists the commands, but the user is inside Claude Code at that point, not reading the README.

## Authorization

The agent may add `plugins/adt/GUIDE.md` and the `guide` skill, and change the `new-project` skill, `README.md`, `README.md.jinja`, `CHANGELOG.md` and `docs/HANDOFF.md`, with tests.

## Items

- [x] 1. `plugins/adt/GUIDE.md` is the single source for the path. It has two tables, a new project and a project with code. Each row gives the step, the command, where, when, what it does, and what the user does next. It also covers the labels only the owner applies and how to update from a new template version.
- [x] 2. `/adt:guide` shows it in the user's language, says which path applies and which command comes next, and runs nothing.
- [x] 3. `/adt:new-project` shows the path first, in a few lines, before its questions, and names `/adt:guide` at the end.
- [x] 4. The README of a new project (`README.md.jinja`) and the template's own README point to `/adt:guide`.
- [x] 5. `tests/unit/plugin-guide.test.ts`: every skill of the plugin is in the guide, and the guide is reachable from the places above.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Every adt command is in the guide, with where and when | `tests/unit/plugin-guide.test.ts` (fails when a new skill is not added) |
| `/adt:new-project` shows the path before its questions | same test; the skill text |
| A new project's README points to `/adt:guide` | same test; `npm run test:template` |
| `npm run check` green | CI |

## Report

- **What was done:** items 1–5.
- **Evidence:** `tests/unit/plugin-guide.test.ts`, `npm run check`, `npm run test:template`.
- **What was NOT verified:** the guide shown by Claude Code from an installed plugin. Installed copies update when the plugin's version changes, in the next release PR.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
