# tests/invariants/: the non-negotiables

⛔ **No agent may edit, delete, skip or weaken the files in this folder.** If it needs to, it **stops and asks** the owner.

## What an invariant is

A business rule that must **never** break, whatever the mission. Example: "the total of an order is never negative".
Each invariant has an ID (`INV-001`, `INV-002`…) listed under **Non-negotiables** in `specs/PRD.md` and a test file here.

## Why it is untouchable

The agent that implements a change is the same one that runs the tests. If it could touch the test, it would have a shortcut: instead of fixing the code, it would "fix" the test. That is why these tests work as a **contract** that only the owner signs.

- A regular unit test (`tests/unit/`) may change when the behavior changes on purpose.
- An invariant changes only when **the business rule** changes, and the owner decides that.

## Protection layers

| Layer | Applies to | What it does | Where |
|---|---|---|---|
| Written rule | Any agent | Forbids it and says to stop and ask | `AGENTS.md`, section 1.2 |
| Local lock | **Claude Code only** | Refuses to write to this folder | `.claude/settings.json` |
| Robot | Any agent or person | `invariants` CI job: fails if the folder changes without the `invariant-approved` label applied by an owner of this folder in `.github/CODEOWNERS`, if a test is skipped (`.skip`, `.todo`, `.only`) or if the number of tests drops. It runs the `main` version of the guard | `.github/workflows/ci.yml` + `scripts/guard-invariants.ts` |
| Required checks | Any agent or person | The `protect-main` ruleset makes `invariants` a required check: a red check blocks the merge. It does not require a code-owner approval: under option A the agents use the owner's account, and GitHub does not let authors approve their own PRs, so the owner's merge click is the approval | `.github/rulesets/protect-main.json` |
| Reviewer | Any PR | A change here without the `invariant-approved` label = **blocking** finding | `REVIEW.md` |

**Codex, Cursor and other agents do not read `.claude/settings.json`.** For them, the protection is `AGENTS.md` (the rule) plus the required CI check, which blocks the PR even if the agent disobeys.

### Local lock details (Claude Code)

- The `Edit(...)` rule covers **all** Claude Code editing tools: Edit, Write, NotebookEdit and writing through Bash redirection (`> file`). `Write(...)` or `MultiEdit(...)` rules with a path are accepted but **never consulted**, and they trigger a warning at startup ([documentation](https://code.claude.com/docs/en/permissions)). That is why the file only uses `Edit`.
- Tested on 2026-10-21 in a fresh Claude Code 2.1.306 session (throwaway copy of the repository):
  - Write to `tests/invariants/` → blocked;
  - Edit of `.claude/settings.json` → blocked;
  - Write to `.github/CODEOWNERS` → blocked;
  - `echo x > tests/invariants/…` → blocked (the same command outside the folder went through);
  - reading `.env.local` → blocked; reading `.env.example` → allowed.
- Limits:
  - the lock only applies in sessions **started inside the repository**, because settings are loaded when the session starts;
  - it does not catch a script (Node, Python) that writes files on its own.

  That is why the final guarantee is the CI.

## How to create or change an invariant (owner only)

1. Write the rule in `specs/PRD.md` (Non-negotiables) with a new ID.
2. Create `tests/invariants/<topic>.invariant.test.ts` with the protected-file header (copy it from an existing one) and tests with the ID in the name (`INV-003a: …`).
3. Prefer tests with **many cases** (including edge values) over a single example.
4. Check that the test **fails** when the code breaks the rule: break the code on purpose, run `npm run test:invariants`, see red, and undo it.
5. Open a PR just for this, apply the `invariant-approved` label yourself, and merge after reviewing.

## Examples in this folder

- `pricing.invariant.test.ts` (INV-001): more than 10,000 subtotal and coupon combinations; the total always stays between 0 and the subtotal, and coupons outside 0–100% are rejected.
- `llm-output.invariant.test.ts` (INV-002): the customer text stays locked between delimiters in the prompt, and no model output outside the closed list is accepted, not even from a "compromised" model.
