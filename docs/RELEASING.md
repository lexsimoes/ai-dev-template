# Releasing the template

Projects are created and updated from **releases** of this template, never from `main`. Copier picks the newest release tag on its own:
- `copier copy gh:lexsimoes/ai-dev-template my-project` creates a project from the latest release;
- `copier update` in a project moves it to the latest release, applying only what changed between the two.

Commits on `main` that are not released yet do not reach any project.

## Versions

Tags follow [Semantic Versioning](https://semver.org): `vMAJOR.MINOR.PATCH`, starting at `v0.1.0`. For a template, the question is "what does `copier update` do to a project?":

| Change | Before 1.0 | From 1.0 on |
|---|---|---|
| Fix or doc change that `copier update` applies cleanly, with nothing to do afterwards | patch (`0.1.1`) | patch |
| New feature, or anything that asks the project to act after updating (a new label, secret, ruleset check, or config field to fill) | minor (`0.2.0`) | minor if nothing breaks, otherwise major |
| A project that updates and does nothing else would break (renamed required check, removed label, changed config format) | minor, marked **Action needed** | major |

1.0 comes when the method stops changing shape (after the M8 rehearsal).

## Day to day

Every PR that changes what projects get adds a line under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) (`Added`, `Changed`, `Fixed`, `Removed`). If projects must act after updating, the line starts with **Action needed:** and says what to do.

## Releasing a version

1. **Release PR** (an agent may prepare it): in `CHANGELOG.md`, turn `## [Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`, open a new empty `## [Unreleased]` above it, and update the link lines at the end. Set the Claude Code plugin to the same version: `version` in `plugins/adt/.claude-plugin/plugin.json` (`X.Y.Z`) and `release` in `plugins/adt/template.json` (`vX.Y.Z`, the release it creates projects from). `npm run check` fails if any of these does not match (`tests/unit/release.test.ts`, `tests/unit/plugin-release.test.ts`).
2. **You merge** the release PR, and publish the release right after (step 3): until the tag exists, the plugin on `main` points at a release that is not there yet.
3. **You publish the release.** Agents never create tags or releases (`AGENTS.md`, 1.7). In your own terminal, in this repository:

   ```bash
   git switch main && git pull
   notes="$(node scripts/release/notes.ts X.Y.Z)" && gh release create vX.Y.Z --target main --title vX.Y.Z --notes "$notes"
   ```

   The `&&` matters: if the changelog is not ready, `notes.ts` says what is missing and the release is **not** created. (Writing `--notes "$(node …)"` directly would still create the release, with empty notes, because the shell ignores a failure inside `$(…)` there.)

   Or on GitHub: **Releases → Draft a new release → Choose a tag** → type `vX.Y.Z` (**Create new tag on publish**, target `main`) → paste the version's section from `CHANGELOG.md` → **Publish release**.
4. **Check:** the release appears at https://github.com/lexsimoes/ai-dev-template/releases, and a new project's `.copier-answers.yml` says `_commit: vX.Y.Z`.

## Once, before the first release

Turn on **release immutability**: **Settings → General → Releases → Enable release immutability**. A published release's tag can then no longer be moved or deleted, so a project that says `_commit: v0.1.0` always means the same code. It applies only to releases published **after** you turn it on.

## A release went wrong

Never move or reuse a tag. Fix it on `main` and publish the next patch (`vX.Y.Z+1`); projects pick it up with `copier update`.
