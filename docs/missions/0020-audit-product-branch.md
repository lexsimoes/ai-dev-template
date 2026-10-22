# Mission 0020: /adt:audit asks which branch is the product

**Status:** in review
**Branch:** `mission/0020-audit-product-branch` · **PR:** not opened yet
**Created on:** 2026-10-22 · **Approved by the owner on:** 2026-10-22 (request after the GoAgentic rehearsal)

## Goal

When the default branch is behind the product (work on a feature branch, or a stack of open PRs), `/adt:audit` asks which branch or PRs represent the product, audits that code, and records it in the report.

## Context

The GoAgentic rehearsal (mission 0019) audited `main`, which is behind. The real product lives on a stack of open PRs on top of a feature branch. The owner asked for the audit to ask, and to record the answer.

The audit runs no git command (mission 0019, security review), so branches and the commit are read from git's own files. The owner switches branches, or adds a worktree, in their own terminal.

## Authorization

The agent may change `plugins/adt/` and its tests, and the docs. It may fetch the PR branches into the read-only GoAgentic clone to rehearse; it may not push anything there.

## Items

- [x] 1. `gitState`: branch, commit, other local and `origin` branches, read from `HEAD`, `packed-refs` and `refs/`; worktrees (`.git` file with `gitdir:`) supported.
- [x] 2. Skill step 1b: ask which branch or PRs are the product; if it is not the one on disk, the owner switches or adds a worktree, then the audit runs again; the report starts with what was audited.
- [x] 3. Areas by path count only code files (a sign-in screenshot is not login code), found in the rehearsal.
- [x] 4. Unit tests; rehearsal on the GoAgentic stack.

## Acceptance

| Criterion | Expected evidence |
|---|---|
| The map shows the branch read, its commit and the other branches | `tests/unit/plugin-audit.test.ts` (`gitState`; real script with packed refs and a worktree) |
| The skill asks for the product branch and records it | skill step 1b and report item 0 |
| Still runs no program of the project | existing hostile-project test |
| `npm run check` green | CI |

## Report

- **Evidence:**
  - Unit tests: 7, including branch names from `packed-refs`, a worktree, a detached HEAD, odd names left out.
  - GoAgentic rehearsal (private: aggregate numbers only):
    - on `main`, the map listed 4 `origin` branches, so the skill asks;
    - after a worktree of the top of the PR stack, the map read that branch and its commit: 1,175 files, 270 test files, 60 migrations;
    - its areas no longer count screenshots or prompt documents.
- **Security review** (diff only, a separate agent): 3 findings at confidence ≥ 8, all fixed and tested with hostile fixtures.
  1. A symbolic link at `.git/refs/heads` was followed: file names outside the project became "branches". Fix: every part of a path under git's folder is checked with `lstat`, and no symbolic link is followed.
  2. `..` in the branch named by `HEAD` read a file outside the project and printed 12 characters of it; a `gitdir:` pointer was followed anywhere. Fix:
     - branch names must be names git itself would accept;
     - a worktree pointer is accepted only when it is `<repo>/.git/worktrees/<name>` and points back to this project;
     - anything else gives branch and commit "unknown".
  3. The skill told the owner to run `git switch` or `git worktree add` inside a folder that may not be trusted, where git can run that folder's own settings and hooks. Fix: a fresh `git clone --branch` from the repository they trust, unless they cloned that folder themselves.
  - Negative control: the hostile test fails against the previous script.
- **What was NOT verified:** the question asked by Claude in an interactive session (the owner's manual test after the next release).
