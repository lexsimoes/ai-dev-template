# Changelog

All notable changes to the ai-dev-template **template** (not to the projects created from it).
Versions follow [Semantic Versioning](https://semver.org); the release flow is in [`docs/RELEASING.md`](docs/RELEASING.md).

An entry marked **Action needed** asks something of projects when they run `copier update` (a label, a secret, a ruleset change…).

## [Unreleased]

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

[Unreleased]: https://github.com/lexsimoes/ai-dev-template/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/lexsimoes/ai-dev-template/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lexsimoes/ai-dev-template/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lexsimoes/ai-dev-template/releases/tag/v0.1.0
