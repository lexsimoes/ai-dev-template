# Mission 0028: exploratory session on request (M7d, PR 4 of 4)

**Status:** in review
**Branch:** `mission/0028-exploratory-session` · **PR:** see the PR of `mission/0028-exploratory-session`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-22 (M7d criteria: "exploratory session, only when you ask: opens issues with reproduction steps and screenshots; each confirmed bug becomes a new test"); 2026-10-23: screenshots on a session branch, issues opened directly, and the two CI protections from the review of #31

## Goal

On the owner's request, an agent explores an area of the app like a curious user and reports what breaks, with steps and screenshots, without fixing anything; a confirmed bug becomes a new end-to-end test.

## Context

The end-to-end tests (PRs 1–3) cover the critical flows. They do not look for what nobody thought of. The GitHub API cannot attach images to an issue, so the owner chose to keep the screenshots on a branch of the session and show them from there.

## Authorization

The agent may add the skill `.claude/skills/explore/SKILL.md`, `scripts/explore-report.ts`, tests, docs, a line in `AGENTS.md` 1.9, `explorations/` in `.gitignore`, and the two CI protections the owner approved (`permissions` for `e2e-quarantine`, the branch check for `e2e-flaky`).
The agent may not run a real session that opens issues (the owner did not ask for one), change the ruleset, or touch `tests/invariants/`.

## Items

- [x] 1. Skill `/explore <area>`: only on request (`disable-model-invocation: true`), isolated mode through the seed, a finding must break a PRD requirement or an `AGENTS.md` rule and reproduce twice, at most 5, never fixed.
- [x] 2. `scripts/explore-report.ts`:
  - checks the session file (closed list of kinds, sizes, real PNG or JPEG inside the repository);
  - pushes the screenshots and `REPORT.md` to `exploration/<date>-<topic>` as one commit with no parent, without touching the working tree and never replacing a branch;
  - opens one issue per finding, skipping one already open, with `@` mentions and `#` links neutralized;
  - `--dry-run` changes nothing.
- [x] 3. CI: `e2e-quarantine` with `permissions: contents: read`; `e2e-flaky` also requires `refs/heads/main`.
- [x] 4. `AGENTS.md` 1.9 (and its twin), `docs/WORKFLOW.md` "Exploratory session", `CHANGELOG.md`, `docs/HANDOFF.md` (also the runtime-built quarantine tag as a known limit).

## Acceptance

| Criterion | Expected evidence |
|---|---|
| Runs only on request, in the isolated mode, never fixes | the skill; `tests/unit/explore-report.test.ts` checks its frontmatter and rules |
| Each finding becomes an issue with steps and screenshots; an open one is not repeated | `tests/unit/explore-report.test.ts` (fake GitHub API) |
| Screenshots on a branch of their own, with no code, never replaced; working tree untouched | same, on a temporary repository with a bare remote |
| Invalid input refused (path outside the repository, symbolic link out, fake image, odd topic) | same |
| A real finding goes through the script | browser rehearsal in the isolated mode + `--dry-run` (in the PR) |
| A confirmed bug becomes a new test | the workflow in `docs/WORKFLOW.md`; first real case pending the owner's confirmation |

## Report

- **What was done:** items 1–4.
- **Evidence:**
  - `tests/unit/explore-report.test.ts` (7 tests).
  - Rehearsal: the Playwright MCP server is not connected in this cloud session, so the skill's browser tools were not available. The same exploration ran with Playwright directly on the app in its isolated mode. It found a real bug, reproduced twice: a 1,990-character message with 221 line breaks is refused as "longer than 2,000 characters", because the form sends CRLF and the server counts it as 2. `--dry-run` printed the issue with the screenshot linked from `exploration/2026-10-23-contact-form`.
- **What was NOT verified:**
  - A full `/explore` run driven by the skill with the MCP browser tools (needs a local Claude Code session with `.mcp.json` approved).
  - A real push of a session branch and a real issue on GitHub: tested only against a local bare remote and a fake API, since the owner did not ask for a session.
  - Images in a private repository's issue rendering from the branch (expected for people with access).
- **Pending decisions for the owner:** the contact form bug (open the issue and fix it in a mission?).
- **Possible injections found in external content:** none.
