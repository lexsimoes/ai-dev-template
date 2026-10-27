# HANDOFF: current state of the project

> This file is the "handoff": any agent (or you, a month from now) reads it first to know where things stand.
> The agent updates it at the end of **every** mission.

**Updated on:** 2026-10-27 · **By:** agent (v0.5.1 release preparation)

## Current state

- Template skeleton created: rules for agents (`AGENTS.md`), sample PRD, mission template, sample invariants, sample evals, PR template.
- Demo app (an online store, in English since M7 PR 1): `src/pricing.ts` (coupon) and `src/ai/classify-message.ts` (LLM classifier, categories `exchange`/`delivery`/`payment`/`other`).
- `npm run check` passes locally; `npm run eval:mock` passes (the mock does not measure real quality).
- Evals in CI with DeepSeek (`EVAL_API_KEY`), thresholds and golden set from `main`, comment with the cost.
- CI on GitHub (`.github/workflows/ci.yml`): jobs `quality`, `invariants` (with the guard `scripts/guard-invariants.ts`) and `dependencies`, on every PR and push to `main`.
- Independent reviewer (`.github/workflows/review.yml`, `scripts/review/`, `REVIEW.md`): DeepSeek `deepseek-flash` by default (pinned to `DeepSeek-V4.1-Flash`), Sonnet on a sensitive path, Opus with the `deep-review` label. Monthly canary, and when a PR that changes the reviewer becomes ready (`.github/workflows/review-canary.yml`).
- `main` protection: ruleset `protect-main` (`.github/rulesets/protect-main.json`) active since the M-EN merge; the old `proteger-main` was deleted after the new one was imported (5 required checks `quality`, `invariants`, `dependencies`, `review`, `evals`, from Actions only; PR required; 0 approvals). Verified in PR #11: with `quality` and `review` red, `mergeable_state` = `blocked`.
- Labels renamed in place after the M-EN merge: `invariant-approved`, `eval-approved`, `deep-review`, `re-review`, `direction-check` (PR #11 confirmed `re-review` triggers the incremental review).
- Weekly direction check (`.github/workflows/direction-check.yml`, `scripts/direction/`): an issue every Monday with the `direction-check` label.
- Copier template (`copier.yml`, `.jinja` twins), proven on every PR by the `template` check (`.github/workflows/template.yml`, `tests/template/`). The owner adds `template` to the live `protect-main` ruleset in the GitHub UI only, never to `protect-main.json`: that file is copied into projects, which have no `template` job, and the check would wait forever.
- No-key mode: `disabled` in the target branch's `.github/review.json` / `evals/config.json` turns those checks into an "off" notice (secret detectors and golden set guard still run). Copier writes it for "no key" answers.
- Template-only (not copied into projects): `LICENSE` (MIT), weekly traffic export to the `traffic` branch (`.github/workflows/traffic.yml`, `scripts/traffic/`, secret `TRAFFIC_TOKEN`), the release flow (`CHANGELOG.md`, `docs/RELEASING.md`, `scripts/release/`, `tests/unit/release.test.ts`), the template's numbered missions, and the Claude Code plugin (`.claude-plugin/`, `plugins/`, `tests/unit/plugin-*.test.ts`).

## Last mission

- Release `v0.5.1` prepared from `main` at `221116f`, after the owner merged [PR #53](https://github.com/lexsimoes/ai-dev-template/pull/53): CHANGELOG `[0.5.1]` dated 2026-10-27, empty `[Unreleased]`, plugin `adt` version `0.5.1` and pinned template release `v0.5.1`. Next: the owner merges the release PR and publishes `v0.5.1` immediately afterwards, following `docs/RELEASING.md`, steps 2–4. No tag or release has been created by the agent; the plugin's new pin requires the owner's publication.
- With the owner's authorization, [release PR #54](https://github.com/lexsimoes/ai-dev-template/pull/54) also corrects the notes CLI test: it compares the full notes with the newest version's changelog content instead of requiring `### Added`, so a patch with only `### Fixed` is valid. Local verification: `npm run check` passes (234 unit tests and 8 invariants), `npm run test:template` passes (7 cases), and `node scripts/release/notes.ts 0.5.1` prints the notes with exit 0. Remote checks and automated review are recorded on the PR; the owner merges and publishes only after they pass.
- Mission 0044 is done ([PR #53](https://github.com/lexsimoes/ai-dev-template/pull/53), merged as `221116f`): generated projects' e2e tsconfig tests no longer read excluded `adopt/**` or rendered-away `package.json.jinja`; those assertions remain in a template-only test. The template runner removes inherited `NODE_TEST_CONTEXT` so generated projects actually execute their tests. A planted copied test reading `copier.yml` proves the `npm run check` failure propagates. Local checks: 234 unit tests, 8 invariants and 7 template cases pass. See the mission report and correction PR for reproduction and red/green evidence.
- Mission 0043: the release PR for `v0.5.0`: CHANGELOG `[0.5.0]` (missions 0038 to 0042), plugin `adt` version `0.5.0`, pinned template release `v0.5.0`. The owner merges and publishes the release.
- Mission 0041: `/adt:guide` and the first step of `/adt:new-project` show the adt commands, where and when to run each, and what comes next (owner's request after the first real use).
- Mission 0042: `/adt:discover` shows a clickable mockup (`prototype/mockup/`) before writing the PRD, for a product with screens, and plans the end-to-end tests as a mission of their own, from the acceptance criteria, before the code; `AGENTS.md` asks for another agent than the implementer to write them when one is available (owner's request after the first real use).
- Mission 0040 (first of the next version): the incremental review starts from the last reviewed commit merged with the PR's current base, so a base merge no longer brings the base's lines into the diff (found on #45).
- Mission 0038: the template's end-to-end tests use only the protected `e2e/tsconfig.json`. CI, `npm run e2e` and the kit's `adt-e2e` pass `--tsconfig`, which also covers the config, so `paths` in the root `tsconfig.json` cannot redirect `@playwright/test` (owner's decision, 2026-10-24; needs the owner's `test-approved`).
- Mission 0039: a new model backend (a new `pinnedFingerprint`, same model name) warns in the review and opens one issue per fingerprint, with the steps to measure it; a new model name still stops the review (owner's decision, 2026-10-24). The reviewer jobs get `issues: write`.
- Mission 0037: M8 report (`docs/missions/0037-m8-report.md`) and the release PR for `v0.4.0`: CHANGELOG `[0.4.0]`, plugin `adt` version `0.4.0`, pinned template release `v0.4.0`. **M8 is done.** The owner merges and publishes the release.
- Mission 0036: `/adt:adopt` brings the end-to-end tester to a project with a web UI:
  - a self-contained `e2e/` with its own pinned Playwright and a protected `e2e/tsconfig.json`;
  - the Playwright test agents, the guard, and `adt-e2e` in observe mode.

  The e2e guard now protects every file in `e2e/`, reads file names with `git -z`, accepts a first setup, and falls back to the project's invariants owner. Rehearsed on adt-sandbox-legacy #1 (adoption) and #2 (its first three tests, green in `adt-e2e`).
- Mission 0035: a regression test proves that a PR deleting `tests/invariants/` fails the guard, even with an unverified label.
- Mission 0034: the reviewer's `standard` and `light` tiers use `deepseek-flash` (V4.1-Flash-1017), owner's decision after mission 0033; `deepseek-v4-pro` documented as the alternative. The canary fixture shows the `applyCoupon` signature, which removes the false positive both models had.
- Mission 0033: the reviewer pins each tier's model version and stops when an alias moves (DeepSeek has no dated ids: `/models` name and the reply are checked). `deepseek-flash` (V4.1-Flash-1017) compared with `deepseek-v4-pro` on the canary and #35 (#39): same planted defects, 4–5× cheaper, 2–3× faster, the same fixture false positive. The default stays Pro until the owner decides.
- Mission 0032 (M8): `/adt:audit` sees personal data and external input in plain `node:http` and Express apps (found on `adt-sandbox-legacy`, whose audit marked both areas empty). The owner confirmed the legacy app's inferred PRD with INV-004 (code-only access, rate limited, no existence leak) and INV-005 (no personal data in logs); `/adt:adopt` on that repository is next.
- Mission 0030 (M8, fixes from the rehearsal):
  - the `dependencies` check failed on every PR of a private repository, because GitHub's dependency review needs Advanced Security. A private repository now runs `npm audit` of what the PR introduces (`scripts/dependency-audit.ts`, from the target branch), and `/adt:check-setup` flags a private project that still needs the update;
  - README fixes from the owner's install and from a newcomer agent that read only the README.
- M8 so far (2026-10-23):
  - The old sandbox `adt-sandbox-m7b` was gone; the owner created `lexsimoes/adt-sandbox-m8` with `/adt:new-project` (v0.3.0, private, no key).
  - [adt-sandbox-m8#1](https://github.com/lexsimoes/adt-sandbox-m8/pull/1): a PR that skips an invariant test is blocked (`invariants` red, `mergeable_state` blocked), and an unrelated label does not turn it green. Closed unmerged.
  - Reviewer comparison on #35 (planted defects, never merged): the standard tier found all 4 plus 2 real extras, for $0.05. The `deep-review` run is pending.
  - The existing-project path runs on `lexsimoes/adt-sandbox-legacy`.
- Mission 0029: first bug found by an exploratory session, fixed through the full cycle. Issue #33 opened by `scripts/explore-report.ts` (branch `exploration/2026-10-23-contact-form`, the first real push and issue of the script); a new end-to-end test (`e2e/contact-message-limit.spec.ts`) failed first; the fix makes the server count line breaks as the browser does, sizes the body limit for 2,000 characters in any alphabet (the same test found a 413 for Japanese text), and states the limit the same way on the page and in the error.
- Mission 0028 (M7d, PR 4 of 4): exploratory session on request (`/explore <area>`, `.claude/skills/explore/SKILL.md`; `AGENTS.md` 1.9). `scripts/explore-report.ts` pushes the screenshots to `exploration/<date>-<topic>` (one commit with no parent) and opens one issue per finding directly (owner's choices on 2026-10-23: screenshots on a session branch, issues opened without a review step). Also: `e2e-quarantine` declares read-only permissions and `e2e-flaky` checks the branch (owner's decision on the review of #31). A rehearsal in the browser found a real bug in the contact form (line breaks counted twice by the server), reported to the owner, not fixed.
- Mission 0027 (M7d, PR 3 of 4): flaky end-to-end tests. `scripts/e2e-flaky.ts` lists tests that passed only on a retry in the `e2e` job summary; on `main`, the `e2e-flaky` job opens one issue per flaky test or comments on the open one. Quarantine = tag `@quarantine` plus an `issue` annotation, under `test-approved`: the required `e2e` check leaves it out, the non-required `e2e-quarantine` check still runs it; the guard (rule 4) fails a quarantine without an issue of the repository, or with a closed one in a PR. Rule in `AGENTS.md` 1.3, `docs/WORKFLOW.md` "Flaky tests".
- Mission 0026 (M7d, PR 2 of 4): end-to-end guard (`scripts/guard-e2e.ts`, first step of the `e2e` job, from the target branch); `test-approved` label in the plugin, the README and the reviewer's approval labels; the healer's conflicting upstream lines rewritten and the planner's `browser_run_code_unsafe` removed (owner's pending decision from PR 1, recommended yes); the rule in `AGENTS.md` (1.3).
- Mission 0025 (M7d, PR 1 of 4): demo web app (`src/web/`), end-to-end tests of the critical flows (`e2e/`) written by the Playwright test agents (`.claude/agents/`, plan in `specs/e2e/`), isolated mode (`APP_ENV=e2e`, fake AI provider only, outside requests blocked), CI job `e2e`, listed as required in `protect-main.json`. The owner adds `e2e` to the live ruleset after its first green run on `main`.
- Mission 0024 (owner's "ok" on the three decisions left by 0023): the required `invariants` check runs `check-fix` on every `fix: address review findings` commit of a PR (checker from the target branch); `AGENTS.md`, `REVIEW.md`, `scripts/guard-invariants.ts` and `evals/config.json` join the never-auto-fix defaults, mirrored in `.github/review.json` and its twin. Adopted projects do not get the CI step yet (their `adt-invariants` workflow is unchanged).
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
5. **M7d (tester)**, 4 PRs plus a release (missions 0025–0028; owner's "ok" on 2026-10-22 with the recommended decisions: demo UI on `node:http`, quarantine needs `test-approved`, `e2e` required in the ruleset file and turned on live by the owner after the first green run on `main`). PRs 1–3 merged (#28, #29, #30, #31); PR 4 (0028, exploratory session) in review; then the `v0.4.0` release after M8:
   - Playwright test agents (planner/generator/healer) write 3 to 8 tests of the critical flows from the PRD; they become a required check.
   - They run only in an isolated environment (local, or a preview with test data), with AI calls replaced by a fake provider. AI quality stays the job of the evals.
   - The healer may update selectors; changing what a test asserts requires the owner's `test-approved` label.
   - A flaky test goes to quarantine with an issue opened, never silently disabled.
   - Exploratory session only on request, opening issues with screenshots and reproduction steps; each confirmed bug becomes a new test.
   - Breaker and newcomer modes only on request.
6. **M8 (rehearsal)**, on `lexsimoes/adt-sandbox-m7b` only (owner's decision, 2026-10-22): the new-project path as is; the existing-project path (`/adt:audit` + `/adt:adopt`) against the sandbox, after adding a small realistic UI to its sample app so the M7d tester has flows to cover; someone (or the newcomer agent) installing from the README alone; the reviewer comparisons already planned; a PR that weakens an invariant and is blocked; a real check that an unrelated label does not turn a red required check green (done on 2026-10-21 in PR #8 with a green check; repeat with a red one).

7. **Release `v0.4.0`** after M8: published on 2026-10-24. **Release `v0.5.0`** (mission 0043): the guide, the discovery mockup and end-to-end tests planned apart from the code, after the owner's first real use; the release PR is ready for the owner's merge and publish.
8. **First real-world use, after the template is done:** a full `/adt:audit` + `/adt:adopt` on GoAgentic, with the owner watching. Until then GoAgentic is not a test bed (it is under active development by Codex).

## GoAgentic rehearsal: what it taught (closed, 2026-10-22)

The adoption rehearsal PR (lexsimoes/goagentic#23) was closed without merge by the owner's decision. What it taught, for the template and for the first real use:
- **Audit:**
  - The default branch was behind the product, which lived in a stack of open PRs. `/adt:audit` now asks which branch or PRs are the product and records it (#23 of this repository).
  - The inferred PRD needed the owner's corrections on goal, users, scope and non-negotiables. Confirming the PRD with the owner is not optional.
  - The project's own tests covered most non-negotiables outside `tests/invariants/`; the agent's mapping of rules to tests must be confirmed by the owner (marked †).
- **Adopt:**
  - The project's formatter, linter and type check include every file. Exclude exactly the kit's files in the project's tool config, never a rule.
  - The reviewer's SDK needs its own lockfile (`npm ci`).
  - The PRD and HANDOFF are never "trivial" for the reviewer.
  - The project's CI did not run on PRs to the product branch: dispatch it, and list the trigger as an owner decision.
  - Map label names (keep the project's own); create new labels only after the owner confirms. Without a `re-review` label, `adt-review` stays red after every push (observe mode, not blocking).
  - Merge `AGENTS.md` by appending a section, and list every conflict (branch prefix, HANDOFF location, language, extra rules) for the owner.
- **CI pulls from GHCR:** `supabase/setup-cli` forces `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io`, and anonymous pulls failed with `toomanyrequests` (429). The fix:
  - `docker login ghcr.io` with the job's `GITHUB_TOKEN` (`packages: read`), and `docker logout` after the last pull;
  - `env -u SUPABASE_INTERNAL_IMAGE_REGISTRY` on `supabase db start`, `db reset` and `test db`, so the pinned CLI falls back from the public ECR to the authenticated GHCR and then to Docker Hub, with 3 tries and 4 s / 8 s waits (the same approach Codex used in goagentic#24);
  - Supabase images cached with `docker save`/`docker load` and `actions/cache`.
  - Proven by three green runs, the third with no pull at all.
  - This repository's CI pulls no container image, so there is nothing to change here. The pattern is for adopted projects that use Supabase (see Pending decisions).

## Pending decisions (owner)

- Decided on 2026-10-24, next PRs after the release:
  - a new DeepSeek fingerprint warns and opens an issue, while a new model name keeps blocking;
  - close the template's own root-`tsconfig` gap in the e2e setup, in a separate PR under the owner's `test-approved`.
- adt-sandbox-legacy#2: its red `adt-review` stays as is (owner's decision, 2026-10-24), recorded as a reviewer limitation in the M8 report.
- M7d PR 1 (mission 0025):
  - after the first green `e2e` on `main`, add `e2e` to this repository's live `protect-main` ruleset;
  - keep HTTP 422 on validation errors (the browser notes it in the console), or return 200 with the error on the page.
- "Keep the GHCR authenticated-pull fix in the template CI": the template's own CI pulls no container image. Proposal: `/adt:audit` flags a project CI that uses `supabase/setup-cli` without it, and `/adt:adopt` offers the fix as a separate, owner-approved change. Waiting for the owner's choice.

- Delete the test repository `lexsimoes/adt-manual-test` after reviewing (agents cannot delete repositories). `lexsimoes/adt-sandbox-m7b` stays: it is the M8 test bed.
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

- Default reviewer: `deepseek-v4-pro` (no switch to flash). Superseded on 2026-10-23: `deepseek-flash`, pinned (mission 0034).
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
- End-to-end quarantine (known limit, owner's decision on 2026-10-23): the guard reads `@quarantine` only from string literals (the `tag` option or the title). A tag built at run time (`"@quar" + "antine"`) escapes its rule 4, while Playwright still leaves the test out of the required `e2e` check. On an existing test it is still a change that needs `test-approved`; on a new test it removes nothing that was in the required check before. `e2e-quarantine` stays out of the required checks (owner's decision).

- The `.claude/settings.json` lock applies **only to Claude Code**, and only in sessions started inside the repository. It blocks Edit, Write and Bash redirection (tested on 2026-10-21), but not a script that writes files on its own. For Codex and other agents, `AGENTS.md` and the required CI job (M3) apply. The final guarantee is CI with the required checks of the protection ruleset (M6).

## How to resume

1. `npm ci`
2. `npm run check`
3. Read the next mission in `docs/missions/` or item 1 of the queue above.
