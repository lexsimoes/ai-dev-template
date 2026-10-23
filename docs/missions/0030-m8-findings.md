# Mission 0030: fixes from the M8 rehearsal (private-repository dependency check, README)

**Status:** in review
**Branch:** `mission/0030-m8-findings` · **PR:** see the PR of `mission/0030-m8-findings`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 (option A: "audit only what the PR introduces"; README fixes from the rehearsal)

## Goal

A private project made from the template can merge PRs: the `dependencies` check works without GitHub Advanced Security. A newcomer can follow the README without tripping.

## Context

The M8 rehearsal turned up both problems.
- **The owner's install.** Running `/adt:new-project` (v0.3.0, private repository) worked, but on the first PR (adt-sandbox-m8#1) the required `dependencies` check failed: "Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled along with GitHub Advanced Security". In a private repository every PR would stay blocked, and `/adt:check-setup` reported the setup as fine.
- **The plugin commands.** The owner pasted the two plugin commands together, and they failed.
- **The newcomer agent.** An agent that read only the README found more friction:
  - the local checks come after the push;
  - there is no instruction for the end-to-end tests;
  - nothing says how to see the template version or how to remove the sample store;
  - the Copier "check" column shows an install command.

  It also reported a "blocker" (`npm run check` failing on a fresh project). That was the planted-bug branch of the reviewer comparison (#35), not the template, and is discarded. The run is to be repeated from a clean `main` after this PR.

## Authorization

The agent may add `scripts/dependency-audit.ts` and its tests, change the `dependencies` job in `.github/workflows/ci.yml` (owner's option A), change the `/adt:check-setup` and `/adt:new-project` messages about the dependency graph, and edit `README.md`, `docs/WORKFLOW.md`, `CHANGELOG.md` and `docs/HANDOFF.md`.

## Items

- [x] 1. `scripts/dependency-audit.ts`:
  - `npm audit` of the PR's lockfile and of the target branch's;
  - fails only on a high or critical advisory the PR introduces;
  - audits a copy of `package.json` and `package-lock.json` against the public registry (the PR's `.npmrc` is not read), and installs nothing;
  - errors (no network, an invalid lockfile) fail, never pass.
- [x] 2. CI: a public repository keeps GitHub's dependency review. A private one runs the script from the target branch, falling back to the PR's copy only while the target branch lacks it.
- [x] 3. `/adt:check-setup`: a private project fails until its CI has the npm audit path, with the fix (`copier update`). `/adt:new-project`'s messages say the same.
- [x] 4. README: the plugin commands are sent one at a time; the local checks and the end-to-end tests run before the repository is created; the Copier check is `copier --version`; how to see the template version; how to remove the sample store (under the owner's labels).

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A PR that adds a vulnerable package fails; one whose vulnerability is already on the target branch passes; no lockfile passes | local runs of the script on a probe lockfile (in the PR); `tests/unit/dependency-audit.test.ts` |
| A public repository is unchanged | `ci.yml` (`!github.event.repository.private`), the `dependencies` check on this PR (public) |
| A private repository runs npm audit and is no longer blocked | adt-sandbox-m8#2: green clean, red with a vulnerable package |
| `/adt:check-setup` tells a private project what to do | `tests/unit/plugin-check-setup.test.ts` |
| README fixes | the diff; the newcomer rehearsal rerun from `main` after the merge |

## Report

- **What was done:** items 1–4.
- **Evidence:**
  - Local runs of the script:
    - `lodash@4.17.15` added: fails, with 3 high advisories;
    - the same advisories already on the target branch: passes, with a note;
    - nothing vulnerable: passes.
  - Unit tests: `tests/unit/dependency-audit.test.ts` (4) and `tests/unit/plugin-check-setup.test.ts` (20).
  - The private path on a real private repository, [adt-sandbox-m8#2](https://github.com/lexsimoes/adt-sandbox-m8/pull/2) (closed unmerged), with the new job and the checker ported:
    - green on the clean commit (with the "PR's copy, first time only" notice);
    - red after `lodash@4.17.15` was added, listing its 3 high advisories.
- **What was NOT verified:** a private project updated with `copier update` after the release (the job was ported by hand for the rehearsal).
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
