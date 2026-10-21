# HANDOFF: current state of the project

> This file is the "handoff": any agent (or you, a month from now) reads it first to know where things stand.
> The agent updates it at the end of **every** mission.

**Updated on:** 2026-10-21 · **By:** agent (M7, PR 2: Copier engine)

## Current state

- Template skeleton created: rules for agents (`AGENTS.md`), sample PRD, mission template, sample invariants, sample evals, PR template.
- Demo app (an online store, in English since M7 PR 1): `src/pricing.ts` (coupon) and `src/ai/classify-message.ts` (LLM classifier, categories `exchange`/`delivery`/`payment`/`other`).
- `npm run check` passes locally; `npm run eval:mock` passes (the mock does not measure real quality).
- Evals in CI with DeepSeek (`EVAL_API_KEY`), thresholds and golden set from `main`, comment with the cost.
- CI on GitHub (`.github/workflows/ci.yml`): jobs `quality`, `invariants` (with the guard `scripts/guard-invariants.ts`) and `dependencies`, on every PR and push to `main`.
- Independent reviewer (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek by default, Sonnet on a sensitive path, Opus with the `deep-review` label. Monthly canary, and when a PR that changes the reviewer becomes ready (`.github/workflows/review-canary.yml`).
- `main` protection: ruleset `protect-main` (`.github/rulesets/protect-main.json`) active since the M-EN merge; the old `proteger-main` was deleted after the new one was imported (5 required checks `quality`, `invariants`, `dependencies`, `review`, `evals`, from Actions only; PR required; 0 approvals). Verified in PR #11: with `quality` and `review` red, `mergeable_state` = `blocked`.
- Labels renamed in place after the M-EN merge: `invariant-approved`, `eval-approved`, `deep-review`, `re-review`, `direction-check` (PR #11 confirmed `re-review` triggers the incremental review).
- Weekly direction check (`.github/workflows/direction-check.yml`, `scripts/direction/`): an issue every Monday with the `direction-check` label.

## Last mission

- M7 PR 2: Copier engine. `copier.yml` (project name, GitHub owner, conversation language, reviewer provider, optional sections), `.jinja` twins of `AGENTS.md`, `CODEOWNERS`, `review.json`, `package.json` plus starter README/PRD/HANDOFF, project-owned files in `_skip_if_exists`. `Template` workflow: twins in sync, 2 generated projects pass their checks, no owner leak, `copier update` keeps project files. Reviewer tests now use a fixed provider config (they depended on this repository's `review.json`).
- M7 PR 1: HANDOFF housekeeping, reviewer `maxDiffChars` back to 150000, and the sample store translated to English (prompt, tag `<customer_message>`, categories, golden set, LLM judge, mock, pricing errors), with evals before/after and the owner's `invariant-approved` (INV-002) and `eval-approved` (golden set).
- M-EN (done, PR #10): translated the template to English (docs, messages, check and label names), with no behavior change.
- M6: `main` protection and weekly direction check.
  - `review` and `evals` are no longer skipped on unrelated labels or on forks (a skipped required check counts as green).
  - The invariant guard runs the `main` version and only accepts the label when applied by a CODEOWNERS owner.
  - Owner decisions applied: evals baseline required; canary only when the PR becomes ready (and in the monthly run).

## Queue (next items)

Roadmap decided by the owner on 2026-10-21 (recorded here; not implemented yet). From now on the template is written in English; the agent talks to the owner in the configured conversation language (pt-BR).

1. **M-EN: done** (PR #10, merged 2026-10-21; post-merge test in PR #11).
2. **M7 (engine)**, split by the owner into 3 PRs, each stopping for the owner's merge:
   1. Housekeeping + sample store in English (done, PR #12).
   2. Copier engine (this PR): `copier.yml` (project name, GitHub owner → CODEOWNERS and the guard's owner, conversation language pt-BR/en, reviewer provider including "none", optional sections Context7 and UI/UX); no hardcoded `@lexsimoes`; 2 generated projects with CI; `copier update` brings a template change without overwriting project files (PRD, invariants, app code).
   3. No-key mode + public release: without an AI key, `quality`, `invariants` and `dependencies` run normally and `review`/`evals` pass with a clear "disabled" notice, without reopening the "skipped check counts as green" loophole for projects that do have a key; MIT license; "Getting started" README; weekly export of GitHub traffic data to a versioned file.
   - The owner's dotfiles and global CLAUDE.md stay out of the template, in a separate private repository.
3. **M7b (entry point): Claude Code plugin** (marketplace in this repository):
   - `/new-project`: empty folder → discovery; existing code → audit. Talks with the person and passes the answers to Copier (`--data`), with no terminal prompts.
   - Automatic setup: labels via `gh`; protection ruleset applied via the API (first check whether the plan allows it on a private repository, and warn); keys registered by the person with `gh secret set NAME` in their own terminal, NEVER through the conversation, with a spending-limit reminder.
   - `/check-setup`: lists what is missing (keys, active ruleset, labels, green CI) and how to fix it.
   - Bridge files for implementers that do not read AGENTS.md natively. Claude Code is the entry point; Codex, Cursor, Antigravity and others are implementers only and just need AGENTS.md.
4. **M7c (discovery and audit):**
   - Discovery: product questions → short PRD with verifiable criteria, non-negotiables with their first tests, skills and MCPs chosen from the answers, and "test before choosing" (throwaway prototype when an idea or model is risky).
   - Audit: map stack, tests and sensitive areas; infer the PRD from the code and ask the owner to confirm; propose non-negotiables from what already exists; turn CI on in observation mode first (non-blocking) and make each check required once it is green.
5. **M7d (tester):**
   - Playwright test agents (planner/generator/healer) write 3 to 8 tests of the critical flows from the PRD; they become a required check.
   - They run only in an isolated environment (local, or a preview with test data), with AI calls replaced by a fake provider. AI quality stays the job of the evals.
   - The healer may update selectors; changing what a test asserts requires the owner's `test-approved` label.
   - A flaky test goes to quarantine with an issue opened, never silently disabled.
   - Exploratory session only on request, opening issues with screenshots and reproduction steps; each confirmed bug becomes a new test.
   - Breaker and newcomer modes only on request.
6. **M8 (rehearsal):** a new project from scratch; an audit of an existing owner project (GoAgentic, read-only, on a branch); someone (or the newcomer agent) installing from the README alone; the reviewer comparisons already planned; a PR that weakens an invariant and is blocked; a real check that an unrelated label does not turn a red required check green (done on 2026-10-21 in PR #8 with a green check; repeat with a red one).

## Pending decisions (owner)

- The template's `AGENTS.md` is the official version of the method (owner decision, 2026-10-21).
- Sections 4 (Context7) and 5 (UI/UX) of `AGENTS.md` incorporate the summary of the owner's `~/.codex/AGENTS.md` sent on 2026-10-21.
- M7: generate global `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` from the template, versioned in a dotfiles repository; optional sections (`<!-- optional:... -->`) turned on by project type.
- `tests/invariants/README.md`, "Owner required" row: it said the `main` protection requires the owner's approval, which does not hold under option A (0 approvals). The M-EN PR rewrites that row (together with the translation of `tests/invariants/` and `.github/CODEOWNERS`), in a separate commit that needs the owner's `invariant-approved` label.
- Default model of the Anthropic adapter: `claude-opus-5-5`. Switching to a cheaper model in the evals is the owner's decision (see `evals/README.md`, Costs).

## Decisions made (owner, 2026-10-21)

- Agent identity: option A (agents keep using the owner's account).
- Language: the template is 100% English from now on; the conversation language is a setting (currently pt-BR), not the language of the files.
- Entry point: Claude Code. Codex, Cursor, Antigravity and others are implementers only and need only AGENTS.md.
- `"Bash(gh pr merge:*)"` added to the `deny` list of `.claude/settings.json` by the owner (commit `dd37036`).
- Ruleset `protect-main` imported and active; a red required check blocks the merge (verified in PR #8: `mergeable_state` = `blocked`).

- Evals baseline required: if the `main` run fails, the `evals` check turns red.
- Reviewer canary on PRs only when the PR becomes ready (and in the monthly run).

- Default reviewer: `deepseek-v4-pro` (no switch to flash).
- `afterReviewPush: "require-re-review"` starting now: a push after the review stays red until `re-review`.
- `trivial.mode: "light"`.
- `@claude` mode in comments (`claude-code-action`): dropped for now.

## Risks and warnings

- The reviewer's state (reviewed commit + open findings) lives in an HTML comment by the bot. Anyone with write permission on the repository can edit that comment; the edit shows up in the comment's history. `AGENTS.md` forbids agents from editing it.
- Pushes after the review are not reviewed by the model (a cost-saving decision). With `require-re-review`, the check stays red until the `re-review` label, so no commit reaches the merge without a review.

- Secrets in `pull_request` workflows: anyone with push permission can, in a PR from the same repository, change a workflow and read `REVIEW_API_KEY`. Mitigation: only the owner and the owner's agents have push access; the reviewer treats `.github/` as sensitive; each key has a spending limit at the provider (confirm the one for `REVIEW_API_KEY` and `REVIEW_DEEP_API_KEY`). An environment with manual approval for secrets was evaluated in M6 and not recommended for a solo developer (one click per review and per eval).
- `REVIEW_DEEP_API_KEY` (Anthropic) is registered: the reviews of PR #6 ran at the `sensitive` tier with `claude-sonnet-5-5`. Without it, the `sensitive` and `deep` tiers fall back to the standard one (the report warns about it).
- The `invariant-approved` label is not tied to a commit: after the owner applies it, later pushes that touch `tests/invariants/` stay approved while the label is on the PR. Under option A (agent = owner) this changes nothing; under option B, removing the label on every push that touches the folder would be the next step (M6 security review, confidence 7/10).
- The golden set protection and the evals thresholds run in the **PR's** `evals/run.ts` (which tests the PR's code). A PR that changes that file can loosen them; the reviewer treats `evals/` as a sensitive path. Running the `main` runner against the PR's code is a possible improvement (predates M6).
- `isAncestor` (reviewer): the "real git failure → error" branch has no test; the "commit deleted by force-push → false" one does.

- The `.claude/settings.json` lock applies **only to Claude Code**, and only in sessions started inside the repository. It blocks Edit, Write and Bash redirection (tested on 2026-10-21), but not a script that writes files on its own. For Codex and other agents, `AGENTS.md` and the required CI job (M3) apply. The final guarantee is CI with the required checks of the protection ruleset (M6).

## How to resume

1. `npm ci`
2. `npm run check`
3. Read the next mission in `docs/missions/` or item 1 of the queue above.
