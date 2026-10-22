# Changelog

All notable changes to the ai-dev-template **template** (not to the projects created from it).
Versions follow [Semantic Versioning](https://semver.org); the release flow is in [`docs/RELEASING.md`](docs/RELEASING.md).

An entry marked **Action needed** asks something of projects when they run `copier update` (a label, a secret, a ruleset change…).

## [Unreleased]

### Added
- Claude Code plugin `adt` and its marketplace in this repository (`/plugin marketplace add lexsimoes/ai-dev-template`, then `/plugin install adt@ai-dev-template`), with `/adt:check-setup`: GitHub login, repository, labels, protection of `main`, secrets by name, reviewer and evals config versus the keys, CI on `main`, template version.
- `/adt:new-project`:
  - In an empty folder: asks a few questions, creates the project from the plugin's pinned template release (Copier, non-interactive), then sets it up on GitHub: repository and first push, labels, `protect-main` ruleset (skipped with the reason on a private repository whose plan does not enforce it).
  - Idempotent: a second run adds only what is missing and never overwrites a repository, label or ruleset.
  - Keys are set by the user with `gh secret set` in their own terminal.
  - In a folder with other code it stops and changes nothing (audit mode comes in M7c).
- Bridges to `AGENTS.md` for agents that do not read it on their own: `.gemini/settings.json` (Gemini CLI) and `.aider.conf.yml` (Aider).

### Changed
- `.gitignore` also ignores `.idea/`, `.vscode/` and `Thumbs.db`, so editor settings are not committed or published by accident.

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

[Unreleased]: https://github.com/lexsimoes/ai-dev-template/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lexsimoes/ai-dev-template/releases/tag/v0.1.0
