# Changelog

All notable changes to the ai-dev-template **template** (not to the projects created from it).
Versions follow [Semantic Versioning](https://semver.org); the release flow is in [`docs/RELEASING.md`](docs/RELEASING.md).

An entry marked **Action needed** asks something of projects when they run `copier update` (a label, a secret, a ruleset change…).

## [Unreleased]

### Changed
- The reviewer warns and opens an issue when the provider's backend for a pinned model changes (a new `pinnedFingerprint`), once per fingerprint, with the steps to measure it and update the pin. Before, a new fingerprint was only a note in the report, easy to miss. The review still goes on, and a new model name still stops it. The `review` and `review-canary` jobs (and an adopted project's `adt-review`) get `issues: write`. Owner's decision after M8.

### Fixed
- The reviewer's incremental review showed what a merge of the base brought into files the PR also changes, such as the changelog, and reported it as the PR's own change (found on #45 after the base merge). It now starts from the last reviewed commit merged with the base the PR has now, so it reviews only what the PR's own commits changed since the review. When that merge conflicts, it shows every change since the reviewed commit, with a note.
- End-to-end tests: a PR could redirect `@playwright/test` through `paths` in the root `tsconfig.json`, which the e2e guard does not protect. That could mean an `expect` that accepts anything, or a `defineConfig` that leaves every test out, with no change in `e2e/`. Playwright now uses only the protected `e2e/tsconfig.json`: the `e2e` and `e2e-quarantine` jobs and `npm run e2e` pass `--tsconfig=e2e/tsconfig.json` (the flag also covers the config file), and `playwright.config.ts` names it. Adopted projects' `adt-e2e` passes it too. Projects get it with `copier update`; the PR that brings it needs the owner's `test-approved` label, as any change to the e2e setup. Found by the security review of mission 0036.

## [0.4.0] - 2026-10-24

End-to-end tests and the M8 rehearsal. Projects get isolated end-to-end tests of their critical flows, with the Playwright test agents to write and repair them, and a guard that lets agents change selectors only. An existing project gets the same tester through `/adt:adopt`. The reviewer pins its model versions and defaults to `deepseek-flash`. A private project's dependency check works without Advanced Security. Everything the M8 rehearsal found is fixed (`docs/missions/0037-m8-report.md`).

### Added
- The implementer handles the automated review before reporting to the owner (`AGENTS.md`, "Handle the review"): it fixes only obvious findings in a separate `fix: address review findings` commit, lists the rest (behavior, architecture, public interface, invariants, golden set, migrations, permissions, likely false positives, contradictions), stops above ~5 fixes or ~10 files, applies `re-review` and reports with the reviewer's cost.
  - `scripts/review/triage.ts findings --pr <n>` splits the open findings by path and origin and shows the cost; `check-fix` refuses a fix commit on a protected path, over the cap, or that weakens a test.
  - `autoFix` in `.github/review.json` can only add protected paths and lower the caps.
  - `/adt:adopt` brings the rule and the script to adopted projects, with the project's invariants folder protected.
- The required `invariants` check runs `check-fix` on every commit titled `fix: address review findings` in a PR, with the checker from the target branch. `AGENTS.md`, `REVIEW.md`, `scripts/guard-invariants.ts` and `evals/config.json` are never auto-fixed.
- `/adt:adopt` brings the end-to-end tester to an existing project with a web UI, in observe mode (`adt-e2e`). The owner gives the command that starts the app in an isolated mode, its port and the variables that would connect it to a real service (`--e2e-start`, `--e2e-port`, `--e2e-env`; `none` without a web UI).
  - `e2e/` is self-contained: its own `package.json` and lockfile pin `@playwright/test` 1.64.1 and the guard's TypeScript parser, so the project's dependencies are not changed. `e2e/playwright.config.ts` starts the app from the project's root and never reuses a running server; `e2e/fixtures.ts` blocks every request outside it; `e2e/tsconfig.json` keeps the project's root `tsconfig.json` (its `paths` could redirect `@playwright/test`) away from the tests.
  - It brings the Playwright test agents (`.claude/agents/`, with the project's label names) and their MCP server (`.mcp.json`), the end-to-end guard, the flaky-test summary, a new label role `testApproved` (`test-approved`), and the owner in `CODEOWNERS` for `e2e/`. No test of the project's flows: the first ones are a mission, written with the agents.
- End-to-end guard: a spec whose name git quotes (a quote, a backslash, a non-ASCII letter) is read like any other; before, the new git listing would have missed it. Any file in `e2e/`, not only code, is protected like the isolation (an adopted project's `e2e/package.json` and lockfile), and an ignored `node_modules/` there is not read. The first setup, when the target branch has no `e2e/` and no `playwright.config.ts`, needs no label; a new spec is still held to the rules. When `e2e/` has no owner in `CODEOWNERS`, the owner of `INVARIANTS_DIR` approves (default `tests/invariants/`).

### Added (M7d, end-to-end tests)
- **Action needed** for projects created before this release: a new required check, `e2e`. Add it to your `protect-main` ruleset (**Settings → Rules → Rulesets → protect-main → Require status checks → Add checks → `e2e`**) once it has run green on `main`; `/adt:check-setup` lists it as missing until then.
- Demo web app (`src/web/`, `npm start`): checkout with a coupon, contact form, support inbox, server-rendered without scripts and with a strict Content-Security-Policy.
- End-to-end tests of the critical flows (`e2e/`, `npm run e2e`, job `e2e` in CI), written by the Playwright test agents (planner, generator, healer in `.claude/agents/`, MCP server in `.mcp.json`) from the plan in `specs/e2e/`. Each title starts with its PRD requirement.
  - Isolated: Playwright starts the app with `APP_ENV=e2e`, which accepts only the fake AI provider and refuses a real one; no secret reaches the job; every browser request outside the app fails the test.
  - The agents carry the project's rules: the healer may update selectors only; changing an assertion needs the owner's `test-approved` label; never `fixme` or `skip`. The healer's upstream lines that said otherwise are rewritten, and the planner has no `browser_run_code_unsafe`.
- End-to-end guard (`scripts/guard-e2e.ts`, first step of the `e2e` job, from the target branch): without the owner's `test-approved`, an existing spec may change only in its selectors (comments and formatting ignored); deleting a spec, any other file in `e2e/` or `playwright.config.ts` needs the label; a new spec may import only `./fixtures.ts` and may not route or mock; `.skip`/`.only`/`.fixme`/`.fail` in any form always fail. The guard reads specs with the TypeScript parser (pinned by the target branch's lockfile, integrity checked, installed before any PR code). The `e2e` job installs with `--ignore-scripts` and calls Playwright directly. `test-approved` joins the reviewer's approval labels.
- **Action needed:** create the `test-approved` label (`gh label create test-approved --color FBCA04 --description "Owner approves changing what an end-to-end test checks"`, or run `/adt:check-setup`).
- New dev dependency: `@playwright/test` 1.64.1 (exact).
- Flaky end-to-end tests (`docs/WORKFLOW.md`, "Flaky tests"): a test that passes only on a retry is listed in the `e2e` job summary, and on `main` the `e2e-flaky` job (the only one with `issues: write`) opens one issue for it or comments on the open one (`scripts/e2e-flaky.ts`). Quarantine is the tag `@quarantine` plus an `issue` annotation, under the owner's `test-approved`: the required `e2e` check leaves the test out, and the new `e2e-quarantine` check (not required) still runs it. The guard fails a quarantine without an issue of the repository, and, in a PR, one whose issue is closed.
- Exploratory session, only on the owner's request (`/explore <area>`, `.claude/skills/explore/SKILL.md`): the agent explores the app in its isolated mode and reports what breaks a PRD requirement or an `AGENTS.md` rule. `scripts/explore-report.ts` pushes the screenshots to a branch of their own (`exploration/<date>-<topic>`, one commit with no parent) and opens one issue per finding with steps and screenshots. A confirmed bug becomes a mission with a new end-to-end test.
- CI: `e2e-quarantine` declares read-only permissions, and `e2e-flaky` also checks that the push is to `main`.

### Changed
- The automated reviewer's `standard` and `light` tiers use `deepseek-flash` (DeepSeek-V4.1-Flash-1017), pinned to `DeepSeek-V4.1-Flash`. Compared side by side with `deepseek-v4-pro`, it found the same planted defects at about a quarter of the cost and in half the time. `deepseek-v4-pro` stays documented as an option (`docs/WORKFLOW.md`, "DeepSeek options"). The `sensitive` and `deep` tiers stay on Claude. Projects get it with `copier update`; a project that wants Pro keeps its own `.github/review.json` values.
- The review canary's `src/pricing.ts` hunks show the whole `applyCoupon` signature: the cut-off header made both models report a missing `now` argument, which has a default.

### Fixed
- The automated reviewer no longer switches models silently when a provider's alias moves upstream. Each tier states `pinnedVersion` (DeepSeek: the name in its `/models`; Anthropic: the model id). The reviewer checks it before paying for a call and on the reply, and stops with a red check on a mismatch, including an Anthropic server-side fallback. `pinnedFingerprint` notes a new backend. `REVIEW_MODEL_VERSION` pins a model set through `REVIEW_MODEL`. **Action needed** for projects that set `REVIEW_MODEL`: also set `REVIEW_MODEL_VERSION`, or the report notes the tier is not pinned. A project that sets only `REVIEW_API_BASE_URL` keeps the pins: that provider's `/models` must list the same name.
- The invariant guard crashed when the project had no invariants folder yet (a project just adopted), so `adt-invariants` was red on every PR. No folder now means no tests. Found by the M8 rehearsal.
- `/adt:adopt` required an eval command, AI paths and required checks, so a project with no AI code or no CI could not be adopted. `--eval-command none` leaves the `adt-evals` check out, and `--required none` says the branch requires nothing yet; the adopted `AGENTS.md` section says so plainly. Found by the M8 rehearsal.
- `/adt:audit` found personal data only in SQL tables and external input only in Next.js routes, so a plain `node:http` or Express app with a booking form looked like it had neither. It now also sees form fields that ask for an e-mail or phone, code that reads them from a record, Express/Fastify-style routes and `node:http` handlers that read a body. The areas feed the reviewer's sensitive paths in `/adt:adopt`. Found by the M8 rehearsal.
- **Action needed** for **private** projects created before this release: the required `dependencies` check failed on every PR ("Dependency review is not supported on this repository"), because GitHub's dependency review needs Advanced Security in a private repository. The check now runs `npm audit` there and fails only on a high or critical advisory the PR introduces (`scripts/dependency-audit.ts`). Update the project (`copier update --defaults`); `/adt:check-setup` flags a private project that still needs it. Found by the M8 rehearsal.
- README: the plugin commands are sent one at a time; the first commit, the local checks and the end-to-end tests come before the repository is created on GitHub (a check needs the first commit); the Copier questions and a non-interactive example; how to see the template version and how to remove the sample store. Found by the M8 rehearsal.
- Demo contact form: a message within the 2,000-character limit was refused when it had many line breaks (the form sends each one as CRLF and the server counted it as two) or was written in a non-Latin alphabet (over the 16 KB body limit). The server now counts line breaks as the browser does, the body limit fits 2,000 characters in any alphabet, and the page and its error state the limit the same way. Found by the first exploratory session (#33); covered by a new end-to-end test.

## [0.3.0] - 2026-10-22

Discovery and audit: a new project starts from a short PRD, and an existing project can be audited read-only and adopt the workflow in observe mode.

### Added
- `/adt:discover` (plugin `adt`), for a project created by `/adt:new-project`:
  - a short conversation about the product becomes `specs/PRD.md`: goal, verifiable acceptance criteria, and non-negotiables with test cases;
  - it also writes the first mission(s), and a throwaway prototype first when an idea or AI model is risky;
  - a deterministic `check` holds the PRD and missions to these rules;
  - the owner approves before the commit, and the result arrives as a PR;
  - skills and MCPs are suggested from a fixed list (`plugins/adt/catalog.json`, documented in `docs/SKILLS.md`), never installed;
  - nothing is written in `tests/invariants/`: each invariant test is created with the code it protects, in a mission, under the owner's `invariant-approved` label.
- `/adt:audit <path>` (plugin `adt`), for a folder with existing code, run from a folder of your own so the project's agent files are not loaded as instructions. It is read-only and runs no program of the project, not even git:
  - it maps the stack, scripts, tests, CI, agent rule files, sensitive areas (authentication, payments, personal data, AI, external input), database access rules and environment variable names;
  - it shows an inferred PRD for the owner to confirm;
  - a fingerprint of the folder, taken before and after, proves nothing changed;
  - the audited project is data: the map carries only counts, closed lists, plain paths and variable names, and it never opens a `.env` file;
  - it stops when it runs inside a project that has agent files (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`).
- `/adt:new-project` and `/adt:discover` point a folder with code to `/adt:audit`.
- `/adt:adopt` (plugin `adt`): adopts the workflow in an existing project of the owner's, after `/adt:audit`.
  - Works on a branch made from the product branch, and opens a PR; never merges.
  - Adds files without overwriting or renaming any; a different existing file is a conflict for the owner.
  - Appends a section to `AGENTS.md` instead of replacing it.
  - Maps the project's label names, and keeps its required checks.
  - Its checks (`adt-review`, `adt-invariants`, `adt-evals` with the project's own eval command without a model) run in observe mode: they report on every PR but are not required.
  - The kit (`adopt/`) comes from the pinned template release.
- `/adt:check-setup` understands adopted projects (`.github/adt.json`): mapped labels, the project's required checks (rulesets or classic branch protection), and each observe check's streak of green PR runs, with when it could become required (the owner decides).
- The invariant guard reads its approval label name from `INVARIANT_LABEL` (default `invariant-approved`) and its folder from `INVARIANTS_DIR` (default `tests/invariants`), for projects with their own names. The defaults are unchanged.
- `/adt:audit` reads the branch, its commit and the other branches from git's files. When other branches exist, it asks which branch or open PRs represent the product (the default branch is often behind), audits that code, and records it at the top of the report.

## [0.2.0] - 2026-10-22

Claude Code becomes the entry point: the `adt` plugin creates a project and checks its setup.

### Added
- Claude Code plugin `adt` and its marketplace in this repository (`/plugin marketplace add lexsimoes/ai-dev-template`, then `/plugin install adt@ai-dev-template`), with `/adt:check-setup`: GitHub login, repository, labels, dependency graph, protection of `main`, secrets by name, reviewer and evals config versus the keys, CI on `main`, template version and available update.
- `/adt:new-project`:
  - In an empty folder: asks a few questions, creates the project from the plugin's pinned template release (Copier, non-interactive), then sets it up on GitHub: repository and first push, labels, dependency graph, `protect-main` ruleset (skipped with the reason on a private repository whose plan does not enforce it).
  - Idempotent: a second run adds only what is missing and never overwrites a repository, label or ruleset.
  - Keys are set by the user with `gh secret set` in their own terminal.
  - In a folder with other code it stops and changes nothing (audit mode comes in M7c).
- Bridges to `AGENTS.md` for agents that do not read it on their own: `.gemini/settings.json` (Gemini CLI) and `.aider.conf.yml` (Aider).

### Changed
- `.gitignore` also ignores `.idea/`, `.vscode/` and `Thumbs.db`, so editor settings are not committed or published by accident.
- The reviewer treats `plugins/**` and `.claude-plugin/**` as sensitive paths.

### Fixed
- **Action needed** for projects created before this release: the required `dependencies` check needs the repository's dependency graph. If it fails with "Dependency review is not supported on this repository", turn it on in **Settings → Code security → Dependency graph** (or run `/adt:check-setup`, which detects it and gives the command).

## [0.1.0] - 2026-10-21

First release: the workflow, the checks and the Copier template.

### Added
- Rules for any coding agent (`AGENTS.md`, `CLAUDE.md`), mission template, PRD with non-negotiables and direction check, `docs/HANDOFF.md`.
- CI: `quality`, `invariants` (with the guard that only accepts the owner's `invariant-approved`), `dependencies`.
- Independent AI reviewer (`review`): DeepSeek by default, Claude on sensitive paths and with `deep-review`, incremental `re-review`, monthly canary.
- Evals for LLM functions (`evals`): golden set protected by `eval-approved`, thresholds and baseline from `main`.
- `protect-main` ruleset, weekly direction check issue.
- Copier template: project name, GitHub owner, conversation language, reviewer provider, evals with a model, optional `AGENTS.md` sections; `copier update` keeps project files.
- No-key mode: `review` and `evals` pass with an "off" notice when the project has no AI key.
- MIT license; generated projects get `THIRD_PARTY_NOTICES.md`.

[Unreleased]: https://github.com/lexsimoes/ai-dev-template/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/lexsimoes/ai-dev-template/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lexsimoes/ai-dev-template/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lexsimoes/ai-dev-template/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lexsimoes/ai-dev-template/releases/tag/v0.1.0
