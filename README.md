# ai-dev-template

A repository template for developing with AI agents. The agent implements, another model reviews, the bots verify everything and **you decide and approve**.

- Every change goes through a PR with required checks: code quality, **non-negotiable rules** (tests no agent may touch), dependencies, an **independent AI review** and **evals** for the functions that call an LLM.
- Agents follow written rules ([`AGENTS.md`](AGENTS.md)) and stop to ask you when a decision is yours.
- Works without any AI key too: the review and evals checks then pass with an "off" notice ([no-key mode](docs/WORKFLOW.md#no-key-mode)).

The full flow, check by check: [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## Getting started

**Fastest path, with Claude Code:** install the `adt` plugin once, then run `/adt:new-project` in an empty folder. In Claude Code, send these two commands **one at a time** (pasted together, they fail):

```
/plugin marketplace add lexsimoes/ai-dev-template
```

```
/plugin install adt@ai-dev-template
```

`/adt:guide` shows every command, where and when to run it, and what comes next. `/adt:new-project` shows the same path before its questions.

`/adt:new-project`:
- **Asks** a few questions in one message: name, public or private, language, AI keys or none.
- **Creates** the project from the latest template release.
- **Sets it up on GitHub:** repository and first push, labels, protection of `main`.
- **Leaves the API keys to you:** it tells you which ones to set and how, in your own terminal; it never asks for them in the chat.
- **Is safe to run twice:** it only adds what is missing.

Then `/adt:discover`, in the new project:
- **Asks** about the product in one message: the problem, the main task, how you will know it works, what must never happen.
- **Writes** a short `specs/PRD.md`: verifiable acceptance criteria, and non-negotiables with their test cases.
- **Shows a clickable mockup** of the main flow (for a product with screens) in `prototype/mockup/`, for your "ok" before anything is written. It is throwaway: it shows the flow, not the final design.
- **Plans** the first mission. Each non-negotiable's test is created with the code it protects, under your `invariant-approved` label. For a product with screens, the end-to-end tests are a mission of their own, planned from the acceptance criteria before the code.
- **Suggests** skills and MCPs from a fixed list, without installing them.
- **Waits for your "ok"** before the commit, then opens a PR.

**Existing code?** Start Claude Code in a folder of your own, not in the project, and run `/adt:audit <path to the project>`. That way the project's own `CLAUDE.md` and settings are not loaded as instructions. It is a read-only audit:
- it maps the stack, the tests and the sensitive areas (login, payments, personal data, AI, webhooks);
- it shows an inferred PRD for you to confirm or correct;
- it changes nothing, and proves it with a fingerprint of the folder taken before and after.

After the audit, `/adt:adopt` (run inside the project) brings the workflow on a branch, as a PR you review:
- **Adds**, never overwrites or renames: an existing file that differs is shown to you as a conflict, and `AGENTS.md` gets a section appended.
- **Keeps** your label names (mapped) and your required checks.
- **Observes first:** the AI review, the invariant guard, your own evals without a model and, for an app with a web UI, the end-to-end tests run on every PR, but they block nothing. `/adt:check-setup` tells you when each one has been green long enough to become required; you decide.
- **End-to-end tester** (web UI only): a self-contained `e2e/` folder with its own pinned Playwright (your `package.json` is not changed), the isolation that blocks every request outside your app, the guard that lets agents change selectors only, and the Playwright test agents (planner, generator, healer) to write the first tests in a mission of their own.

`/adt:check-setup` checks everything at any time. The prerequisites are the ones in step 1 below.

The steps below do the same by hand.

### 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| [Node.js](https://nodejs.org) | 22.18 or newer (TypeScript runs directly on Node, no build step) | `node --version` |
| [Git](https://git-scm.com) | any recent | `git --version` |
| [GitHub CLI](https://cli.github.com) | logged in to your account | `gh auth status` |
| [Copier](https://copier.readthedocs.io) | 9.18.2 or newer (install: `pipx install copier==9.18.2`, with [pipx](https://pipx.pypa.io)) | `copier --version` |
| AI keys | **optional**: DeepSeek and/or Anthropic, each with a spending limit | see step 5 |

### 2. Create the project

```bash
copier copy gh:lexsimoes/ai-dev-template my-project
```

Copier uses the latest **release** of the template ([releases](https://github.com/lexsimoes/ai-dev-template/releases), [changelog](CHANGELOG.md)), never unreleased work on `main`. To pick a version: `--vcs-ref v0.1.0`. The version you got is `_commit` in the project's `.copier-answers.yml`.

Copier asks a few questions: project name and package name, your GitHub username (it becomes the owner in `.github/CODEOWNERS`), the language agents use to talk to you, the reviewer's provider (or "None" for no key), whether evals run with a real model, and two optional sections of `AGENTS.md`, both on by default: library documentation through Context7, and UI/UX rules. Without a terminal (a script or an agent), pass the answers instead: `--defaults --data project_name=my-project --data github_owner=<you> --data reviewer_provider=none --data evals_with_model=false`. What each answer changes: [`docs/WORKFLOW.md`](docs/WORKFLOW.md#creating-a-project-from-this-template-copier).

Make the first commit (local only; some checks compare against git), check that everything passes on your machine, then create the repository on GitHub:

```bash
cd my-project
git init -b main && git add -A && git commit -m "chore: project created from ai-dev-template"
npm ci
npm run check       # lint, types, unit tests, invariants (stops at the first failure; search the output for "not ok")
npm run eval:mock   # evals with the fake provider: no key, no cost
npx playwright install chromium   # once: the browser for the end-to-end tests (on a fresh Linux machine: --with-deps chromium)
npm run e2e         # end-to-end tests of the critical flows, with the fake AI provider
gh repo create my-project --public --source . --push   # from here on, gh must be logged in
```

A **public** repository gets branch protection and Actions minutes for free. A private one needs GitHub Pro (or Team) for the protection to be enforced ([details](docs/WORKFLOW.md#private-repository)).

### 3. Create the labels

Labels are how you talk to the bots on a PR. Run once, in the project folder:

```bash
gh label create re-review --color 1D76DB --description "Review again, only what changed since the last review"
gh label create deep-review --color 5319E7 --description "Full review with the strongest model (owner only)"
gh label create invariant-approved --color B60205 --description "Owner approves a change to the non-negotiable tests"
gh label create eval-approved --color D93F0B --description "Owner approves deleting or changing golden set cases"
gh label create test-approved --color FBCA04 --description "Owner approves changing what an end-to-end test checks"
gh label create direction-check --color 0E8A16 --description "Weekly direction check issue"
```

### 4. Protect `main`

Import `.github/rulesets/protect-main.json` in **Settings → Rules → Rulesets → New ruleset → Import a ruleset** (step by step: [Protecting `main`](docs/WORKFLOW.md#how-to-turn-it-on-once-on-github)). From then on, nothing reaches `main` without a PR and green checks, not even you.

### 5. AI keys (optional)

Without keys, skip this step: if you answered "None" for the reviewer and "no" for evals, those checks pass with an "off" notice. You can turn them on later ([no-key mode](docs/WORKFLOW.md#no-key-mode)).

With keys:
1. Create each key at the provider and set a **spending limit** there (a few dollars a month is plenty to start).
2. Save it **in your own terminal**, never by pasting it in a chat with an agent. The command asks for the value without showing it:

   ```bash
   gh secret set REVIEW_API_KEY        # reviewer (DeepSeek, or Anthropic if you chose "Claude only")
   gh secret set REVIEW_DEEP_API_KEY   # optional: Claude for sensitive paths and the deep-review label
   gh secret set EVAL_API_KEY          # evals: a separate key, also with a spending limit
   ```

### 6. Your first PR

1. Write what the project must do in `specs/PRD.md`: goal, acceptance criteria and the **non-negotiables** (each one gets a test in `tests/invariants/`). Replace the sample store (`src/pricing.ts`, `src/ai/classify-message.ts`, `src/web/`) with your own code as you go. It comes with its own non-negotiable tests, golden set and end-to-end tests: removing those is your decision, in a PR that carries your `invariant-approved`, `eval-approved` and `test-approved` labels.
2. Write a mission in `docs/missions/` (a work order with verifiable acceptance criteria) and ask your agent (Claude Code, Codex…) to carry it out.
3. The agent works on a branch `mission/<NNNN>-<topic>` and opens a **draft** PR. When it is done, it marks the PR **Ready for review**: the reviewer runs once, and the evals run if the PR touches AI files.
4. Read the PR: requirement → evidence → status, what was not verified, and the reviewer's comment. If something needs another look after a fix, apply `re-review`.
5. **You** click merge. Agents never merge.

### 7. What it costs

| Item | Cost |
|---|---|
| GitHub Actions | Free in a public repository. Private: 2,000 free minutes a month (Free plan); each PR uses a few minutes |
| Review of a medium PR (DeepSeek Flash) | ≈ $0.01 full review, less incremental (`re-review`) |
| Review on sensitive paths (Claude Sonnet) / `deep-review` (Claude Opus) | ≈ $0.07 / ≈ $0.14 |
| Evals (only PRs that touch AI) | under $0.01 per run |
| Review canary | one review a month, plus one when a PR changes the reviewer |
| No-key mode | $0 |

Estimates from list prices; each review and eval comment shows the real tokens and cost ([details](docs/WORKFLOW.md#costs)).

### 8. Updating from the template

The project remembers its template in `.copier-answers.yml`. On a clean working tree:

```bash
copier update --defaults
```

It moves the project to the latest release. Your PRD, HANDOFF, app code, invariants and golden set are never overwritten; template files (workflows, reviewer, `AGENTS.md`…) are merged. Read the [changelog](CHANGELOG.md) for entries marked **Action needed**, review the diff and open a PR.

### 9. Check the setup (Claude Code)

With the `adt` plugin installed (see the top of this section; on Claude Code 2.1.275 or later, one step: `/plugin install adt --marketplace lexsimoes/ai-dev-template`), run `/adt:check-setup` in the project folder. It says how to fix each problem. It checks:
- the GitHub CLI login and the repository;
- the labels and the protection of `main` with its required checks;
- the secrets, by name only, and whether the reviewer and evals settings match them (or no-key mode);
- CI on `main`, and whether a newer template release is available.

It only reads; it never asks for a key.

## What comes ready

| Piece | File | What for |
|---|---|---|
| Rules for agents | [`AGENTS.md`](AGENTS.md) · [`CLAUDE.md`](CLAUDE.md) | How any agent must work here |
| Skills | [`docs/SKILLS.md`](docs/SKILLS.md) | Which skill to use per task, where it comes from and how to install it |
| Requirements | [`specs/PRD.md`](specs/PRD.md) | Goal, acceptance criteria, **non-negotiables**, direction check |
| Missions | [`docs/missions/`](docs/missions/) | A work order for each task |
| Handoff | [`docs/HANDOFF.md`](docs/HANDOFF.md) | Current state and queue |
| Non-negotiables | [`tests/invariants/`](tests/invariants/) | Tests no agent may touch |
| Evals | [`evals/`](evals/) | Golden set + evaluator for functions with an LLM |
| End-to-end tests | [`e2e/`](e2e/) · [`playwright.config.ts`](playwright.config.ts) | 3 to 8 critical flows in a real browser, isolated, with a fake AI provider |
| Reviewer | [`REVIEW.md`](REVIEW.md) · [`scripts/review/`](scripts/review/) | Independent AI review of every ready PR |
| PR template | [`.github/pull_request_template.md`](.github/pull_request_template.md) | Requirement → evidence → status |

## Demo app

So the examples have something real to test, the template ships a minimal store:
- `src/pricing.ts`: applies a discount coupon (protected by INV-001);
- `src/ai/classify-message.ts`: classifies customer messages with an LLM (protected by INV-002 and measured by evals).
- `src/web/`: three pages to walk through in a browser (`npm start`): checkout with a coupon, contact form, support inbox. The end-to-end tests in `e2e/` cover their critical flows.

## Maintaining this template

These parts exist only in this repository; Copier does not copy them into projects (`_exclude` in `copier.yml`):

| Piece | What for |
|---|---|
| `copier.yml`, `*.jinja` files | The questions and the files that change with the answers |
| `tests/template/`, check `template` | Proves on every PR that the `.jinja` twins match this repository's files, that two projects with different answers pass their own checks, and that `copier update` keeps project files |
| `.github/workflows/traffic.yml`, `scripts/traffic/` | **Traffic export**, below |
| `.claude-plugin/marketplace.json`, `plugins/adt/`, `docs/PLUGIN-TEST.md` | The Claude Code plugin and its marketplace (installed from this repository), and its manual test. `plugins/adt/template.json` pins the release it creates projects from |
| `adopt/` | What `/adt:adopt` brings into an existing project: the kit list and the observe-mode workflows |
| `CHANGELOG.md`, `docs/RELEASING.md`, `scripts/release/` | Versions and the release flow: projects are created and updated only from release tags |
| `LICENSE` | The template's license. Projects get its notice in `THIRD_PARTY_NOTICES.md` instead (from `THIRD_PARTY_NOTICES.md.jinja`), which does not set the project's own license |

### Traffic export

GitHub keeps a repository's traffic (views, clones, popular pages, referrers) for 14 days only. Every Monday, the `Traffic export` workflow adds the current window to CSV files in `data/` on the `traffic` branch, so the history is versioned. That branch holds only data; `main` stays protected.

The workflow token cannot read traffic, so it needs a token of yours, read-only and limited to this repository:
1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → this one. Permissions: **Administration: Read-only** (nothing else). Pick an expiration date and note it down.
3. In your own terminal: `gh secret set TRAFFIC_TOKEN` (it asks for the value without showing it).
4. **Actions → Traffic export → Run workflow** to test.

When the token is missing, expired or lacks the permission (or any step fails), the run turns red **and** opens an issue labeled `traffic-export` with the reason and the steps to fix it; the next good run closes it. The same issue warns 30 days before the token expires.

## License

The template is under the [MIT License](LICENSE), © Alexandre Simoes. Projects created from it get a `THIRD_PARTY_NOTICES.md` with that notice (keep it; `copier update` keeps it up to date). It covers only what came from the template and does not license your project: choose your own license and put it in a `LICENSE` file.
