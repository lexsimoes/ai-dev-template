# HANDOFF: current state of the project

> This file is the "handoff": any agent (or you, a month from now) reads it first to know where things stand.
> The agent updates it at the end of **every** mission.

**Updated on:** 2026-10-22 · **By:** agent (mission 0023, review findings)

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
- Copier template (`copier.yml`, `.jinja` twins), proven on every PR by the `template` check (`.github/workflows/template.yml`, `tests/template/`). The owner adds `template` to the live `protect-main` ruleset in the GitHub UI only, never to `protect-main.json`: that file is copied into projects, which have no `template` job, and the check would wait forever.
- No-key mode: `disabled` in the target branch's `.github/review.json` / `evals/config.json` turns those checks into an "off" notice (secret detectors and golden set guard still run). Copier writes it for "no key" answers.
- Template-only (not copied into projects): `LICENSE` (MIT), weekly traffic export to the `traffic` branch (`.github/workflows/traffic.yml`, `scripts/traffic/`, secret `TRAFFIC_TOKEN`), the release flow (`CHANGELOG.md`, `docs/RELEASING.md`, `scripts/release/`, `tests/unit/release.test.ts`), the template's numbered missions, and the Claude Code plugin (`.claude-plugin/`, `plugins/`, `tests/unit/plugin-*.test.ts`).

## Last mission

- Mission 0023: the implementer handles the automated review before reporting (owner's rule, 2026-10-22). `AGENTS.md` (and its twin, and the section adopted projects get), "Handle the review": obvious fixes in a separate `fix: address review findings` commit, everything else listed, cap ~5 fixes / ~10 files, then `re-review` and a report with the reviewer's cost. `scripts/review/triage.ts` (`findings`, `check-fix`), `autoFix` in `.github/review.json`, planted-finding tests in `tests/unit/review-triage.test.ts`. Also brought to GoAgentic's adoption PR (lexsimoes/goagentic#23).
- Release `v0.3.0` published by the owner on 2026-10-22 (immutable, tag on `main`).
- Release PR for `v0.3.0` (mission 0022): CHANGELOG `[0.3.0]`, plugin `adt` version `0.3.0`, pinned template release `v0.3.0`.
- M7c PR 3 (mission 0021): `/adt:adopt`.
  - Adoption on a branch, add-only.
  - `AGENTS.md` merged by appending a section.
  - Label names mapped.
  - Checks in observe mode; `/adt:check-setup` reports when each could become required.
  - Rehearsed on GoAgentic: a draft PR on top of its PR stack, no merge (the owner keeps it open until the real test ends).
- Mission 0020: `/adt:audit` asks which branch or PRs are the product, and records it. Branches are read from git's files, never by running git. Path-based areas count only code files.
- M7c PR 2 (mission 0019): `/adt:audit`.
  - Read-only map of existing code: stack, tests, CI, agent rule files, sensitive areas, database access rules, environment variable names.
  - It shows an inferred PRD for the owner to confirm.
  - A folder fingerprint, taken before and after, proves nothing changed.
  - Rehearsed on GoAgentic (private; its report went to the owner only).
- M7c PR 1 (mission 0018): `/adt:discover`.
  - A conversation about the product → `specs/PRD.md` and the first missions, approved by the owner before the commit, in a PR.
  - `discover.ts check` holds the PRD and missions to the M7c rules.
  - Skills and MCPs come from the fixed list `plugins/adt/catalog.json`.
  - Owner decision: nothing is written in `tests/invariants/` at discovery. Each rule's cases go into the PRD, and its test is created with the code it protects, in a mission with `invariant-approved`.
  - Rehearsed in a project generated from `v0.2.0`. The owner's manual test (`docs/PLUGIN-TEST.md`, step 7) waits for the next release.
- Release PR for `v0.2.0` (mission 0017): CHANGELOG `[0.2.0]`, plugin `adt` version `0.2.0`, pinned template release `v0.2.0`. The owner publishes the release right after the merge (until then `/adt:new-project` from `main` reports the release as not published).
- M7b PR 3 (mission 0015): plugin renamed `adt` (owner decision); `plugins/**` and `.claude-plugin/**` are sensitive paths for the reviewer; `/adt:new-project` (empty folder → Copier from the pinned release → GitHub repository, labels, ruleset; idempotent; folder with code → stop); manual test in `docs/PLUGIN-TEST.md`. Sandbox rehearsal `adt-sandbox-m7b` and the owner's manual test on the Mac (all ✅; permission prompts not shown because of the owner's permission mode): see the mission report.
- M7b PR 2 (mission 0014): Claude Code plugin `adt` and marketplace in this repository; `/adt:check-setup` (read-only; secrets by name only); bridges for Gemini CLI (`.gemini/settings.json`) and Aider (`.aider.conf.yml`). The plugin pins the template release in `plugins/adt/template.json` and its version follows the CHANGELOG (bumped in release PRs).
- `v0.2.0` released by the owner on 2026-10-22 (immutable, tag on the #20 merge); `v0.1.0` on 2026-10-21.
- M7b PR 1 (mission 0013): releases. Semver tags `vX.Y.Z` from `v0.1.0`; `CHANGELOG.md`; `docs/RELEASING.md` (release PR by an agent, tag and release by the owner with `gh release create`); `scripts/release/notes.ts`; Copier and the docs use the latest release, not `main`. Agents never tag or release (`AGENTS.md` 1.7).
- M7 PR 3: no-key mode + public release.
  - Reviewer race fixed in the reviewer itself: every run decides from the live PR (labels read from the API, review state in the comment). A push and `re-review` close together end with the same verdict in both runs, in either order, with one model call (`tests/unit/review-flow.test.ts`, "race"; the same test fails against the previous reviewer).
  - Findings that depend on an approval label no longer stay pending: adding or removing `invariant-approved` / `eval-approved` (`approvalLabels`) runs a full review when findings are open; `review.yml` also triggers on `unlabeled`.
  - No-key mode (see `docs/WORKFLOW.md`, "No-key mode"), Copier question `evals_with_model`, MIT `LICENSE` (+ `THIRD_PARTY_NOTICES.md` in projects), "Getting started" README, traffic export with an alert issue on failure or near expiry.
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
   2. Copier engine (done, PR #13): `copier.yml` (project name, GitHub owner → CODEOWNERS and the guard's owner, conversation language pt-BR/en, reviewer provider including "none", optional sections Context7 and UI/UX); no hardcoded `@lexsimoes`; 2 generated projects with CI; `copier update` brings a template change without overwriting project files (PRD, invariants, app code).
   3. No-key mode + public release (this PR): without an AI key, `quality`, `invariants` and `dependencies` run normally and `review`/`evals` pass with a clear "disabled" notice, without reopening the "skipped check counts as green" loophole for projects that do have a key; MIT license; "Getting started" README; weekly export of GitHub traffic data to a versioned file.
   - The owner's dotfiles and global CLAUDE.md stay out of the template, in a separate private repository.
3. **M7b (entry point): Claude Code plugin** (marketplace in this repository), split by the owner into small PRs: releases (done, #16), plugin + marketplace + `/check-setup` + bridge files (done, #17), `/new-project` + sandbox rehearsal + manual install test (done, #18). **M7b is done**, released in `v0.2.0`.
   - `/new-project`: empty folder → discovery; existing code → audit. Talks with the person and passes the answers to Copier (`--data`), with no terminal prompts.
   - Automatic setup: labels via `gh`; protection ruleset applied via the API (first check whether the plan allows it on a private repository, and warn); keys registered by the person with `gh secret set NAME` in their own terminal, NEVER through the conversation, with a spending-limit reminder.
   - `/check-setup`: lists what is missing (keys, active ruleset, labels, green CI) and how to fix it.
   - Bridge files for implementers that do not read AGENTS.md natively. Claude Code is the entry point; Codex, Cursor, Antigravity and others are implementers only and just need AGENTS.md.
4. **M7c (discovery and audit)**, 3 PRs (owner's "ok" on 2026-10-22; audit rehearsal on GoAgentic, read-only; two commands): `/adt:discover` (done, #21), `/adt:audit` (done, #22 and #23), adoption on a branch with CI in observation mode (done, #24). **M7c is done**, released in `v0.3.0`. The owner's manual tests (`docs/PLUGIN-TEST.md` steps 7, 7b, 7c) wait until GoAgentic's Phase B test ends.
   - Discovery: product questions → short PRD with verifiable criteria, non-negotiables with their first tests, skills and MCPs chosen from the answers, and "test before choosing" (throwaway prototype when an idea or model is risky).
   - Audit: map stack, tests and sensitive areas; infer the PRD from the code and ask the owner to confirm; propose non-negotiables from what already exists; turn CI on in observation mode first (non-blocking) and make each check required once it is green.
5. **M7d (tester)**, proposed in 4 PRs plus a release (missions 0024–0027, after 0023); waiting for the owner's "ok" on the criteria:
   - Playwright test agents (planner/generator/healer) write 3 to 8 tests of the critical flows from the PRD; they become a required check.
   - They run only in an isolated environment (local, or a preview with test data), with AI calls replaced by a fake provider. AI quality stays the job of the evals.
   - The healer may update selectors; changing what a test asserts requires the owner's `test-approved` label.
   - A flaky test goes to quarantine with an issue opened, never silently disabled.
   - Exploratory session only on request, opening issues with screenshots and reproduction steps; each confirmed bug becomes a new test.
   - Breaker and newcomer modes only on request.
6. **M8 (rehearsal):** a new project from scratch; an audit of an existing owner project (GoAgentic, read-only, on a branch); someone (or the newcomer agent) installing from the README alone; the reviewer comparisons already planned; a PR that weakens an invariant and is blocked; a real check that an unrelated label does not turn a red required check green (done on 2026-10-21 in PR #8 with a green check; repeat with a red one).

## Pending decisions (owner)

- Delete the test repositories `lexsimoes/adt-sandbox-m7b` and `lexsimoes/adt-manual-test` after reviewing (agents cannot delete repositories).
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

- M7 PR 3: license holder "Alexandre Simoes"; keep MIT; generated projects get `THIRD_PARTY_NOTICES.md` with the template's notice (template-managed, so `copier update` keeps it; it does not set the project's license).
- M7 PR 3: in no-key mode, the secret detectors and the golden set guard stay blocking, and their comment explains the fix.
- M7 PR 3: `TRAFFIC_TOKEN` set by the owner (fine-grained, Administration read-only, this repository only, expires in 1 year). A failed export opens an alert issue; it also warns 30 days before expiry.

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
