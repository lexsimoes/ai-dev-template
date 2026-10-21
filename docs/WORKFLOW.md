# WORKFLOW: how to work with this template

The agent implements, another model reviews, the robots verify, and **you decide and approve**.

## Flow map

```
 ★ = YOU decide           🤖 = robot/agent          ⛔ = mandatory stop

 ★ 1. MISSION ────────── you write or approve docs/missions/NNNN-topic.md
       │                 (goal, authorization, acceptance criteria)
       ▼
 🤖 2. BRANCH ────────── agent creates mission/NNNN-topic from main
       │
       ▼
 🤖 3. CODE + TESTS ──── agent implements, commits and pushes
       │                 ⛔ invariant in the way → STOPS and asks you ★
       ▼
 🤖 4. PULL REQUEST ──── agent opens the PR as a DRAFT on the first push, works on it
       │                 and only at the end marks it "Ready for review" (with the
       │                 requirement → evidence → status table filled in)
       │
       ├────────────────────────┬─────────────────────────────┐
       ▼                        ▼                             ▼
 🤖 5a. CI                 🤖 5b. REVIEW                🤖 5c. PREVIEW (e.g. Vercel)
     lint · types · tests      independent reviewer         an address just for this PR,
     invariants (required)     (another provider/model)     created BEFORE the merge
     dependency audit          DeepSeek → Sonnet on         for you to click and test
     evals (if AI changed)     sensitive path → Opus
                               with "deep-review"
                               blocking/important/suggestion
       │                        │                             │
       └────────────┬───────────┴─────────────────────────────┘
                    ▼
          red or blocking?
            │ yes              │ no
            ▼                  ▼
 🤖 6. FIX               ★ 7. YOUR APPROVAL
     agent fixes on the      you read the summary, what was NOT verified,
     same branch and         the pending decisions, test the Preview
     goes back to step 5     and click Approve
                               │
                               ▼
                         ★ 8. MERGE into main (protected)
                               │
                               ▼
                         🤖 9. DEPLOY TO PRODUCTION (automatic on merge)

   ⚠️  Approving the merge = approving the Production deploy.
       There is no second gate after the merge: the gate is step 7.

 🤖 every week: "Direction check" issue compares the PRD with what was delivered → you read it ★
```

## Where you come in

| Moment | What you do | How long |
|---|---|---|
| Before | Write the PRD, the non-negotiables and each mission (what counts as "done") | 10–30 min per mission |
| During | Answer when the agent stops (invariant, product, security, secret) | As needed |
| On the PR | Read the summary and the review, **test the Preview**, and approve or ask for changes | 5–15 min |
| Merge | Click merge, knowing that this **publishes to Production** | 1 min |
| Weekly | Read the "Direction check" issue | 5 min |

## A mission, step by step

1. **Write the mission.** Copy `docs/missions/_TEMPLATE.md` to `docs/missions/NNNN-topic.md`, fill in the goal, authorization and acceptance, and set `Status: approved`.
2. **Call the agent.** Example request: *"Run the mission `docs/missions/0003-checkout-coupon.md` following AGENTS.md."*
3. **Answer the stops.** If the agent asks, decide. If the decision changes the business rule, update the PRD.
4. **Read the PR**, in this order:
   1. the requirement → evidence → status table (any 🟡, ⬜ or ❌?);
   2. "What was NOT verified" and "Pending decisions";
   3. the checks at the bottom of the page (all green?);
   4. the reviewer's comments (any **blocking** ones?);
   5. the **Preview**: click it and test what changed, as a user.
5. **Approve and merge** only if everything above is ok. Remember: this publishes to Production.
6. **Check the HANDOFF.** The agent should have updated `docs/HANDOFF.md` with the state and the next mission.

## Asking for a fix

- Comment on the PR what is wrong (or point to a reviewer finding) and ask the agent: *"fix finding X of PR #N on the same branch"*.
- The agent fixes it **on the same branch**; CI and the review run again on their own.
- Feedback from a customer, an issue or an e-mail becomes a **new mission**, never a direct fix (`AGENTS.md`, section 1.5).

## Local commands

| Command | What it does |
|---|---|
| `npm ci` | Installs the dependencies exactly as in `package-lock.json` |
| `npm run check` | Lint + types + tests + invariants (the same as CI runs) |
| `npm run test:invariants` | Only the non-negotiables |
| `npm run guard:invariants` | The invariant guard against `main` (folder untouched, nothing skipped) |
| `npm run eval:mock` | Evals at no cost (tests only the plumbing) |
| `npm run eval` | Evals with the provider from `LLM_PROVIDER` |
| `npm run review:dry-run` | Shows what the reviewer would send (files, redacted secrets, tier, size) without calling any model |
| `npm run review:local` | Reviews your branch against `main` with the real model (needs `.env.local`) |
| `npm run review:canary` | Runs the review canary with the real model (needs `.env.local`) |

## CI: the robots on each PR

The file `.github/workflows/ci.yml` runs on its own on every PR (drafts included) and on every push to `main`. There are 3 independent jobs, each on its own machine:

| Check | What it verifies | Fails when |
|---|---|---|
| `quality` | Installs with `npm ci`, runs lint, types and unit tests | Code out of standard, type error or broken test |
| `invariants` | Runs the guard (`scripts/guard-invariants.ts`) and the tests in `tests/invariants/` | A non-negotiable broke, one of its tests was skipped, or the folder changed without the `invariant-approved` label |
| `dependencies` | Checks **only the dependencies the PR adds or changes** | One of them has a known vulnerability of high or critical severity |

These three, plus `review` and `evals`, are **required checks** when the `main` protection rule is on (see "Protecting `main`"): with any of them red, the merge button is locked.

### How to read a red check

1. At the bottom of the PR page, in the checks box, look for the ❌ and click **Details** next to it.
2. The job page opens, with the list of **steps** on the left. The step with ❌ is where it stopped; the following ones do not even run.
3. Click the red step to open the **log** (the text the machine wrote). Read it from the bottom up: the cause is usually in the last 20 lines.
4. Look for these words:
   - `not ok`: a test that failed, with its name (e.g. `INV-001b`);
   - `error`: lint or types;
   - `❌ Invariant guard`: the guard explains the reason in plain English.
5. Shortcut: the job's **Summary** tab shows the invariant guard summary without opening the log.

Then ask the agent: *"check X failed with this message: …, fix it on the same branch"*. If the red is in `invariants`, the agent **cannot** touch the test: it either fixes the code, or stops and asks you (`AGENTS.md`, section 1.2).

### Label `invariant-approved`

When **you** decide to change a non-negotiable rule:
1. Open the PR.
2. In the right column, under **Labels**, apply `invariant-approved`.
3. The guard runs again and accepts the change in the folder.

Even with the label, skipped tests (`.skip`, `.todo`, `.only`) **never** pass.

The guard only accepts the label if whoever applied it **last** is an owner of `tests/invariants/` in the `.github/CODEOWNERS` of `main`. It also shows the label's full history in the job's **Summary**: who applied it, who removed it, and when. If the Actions bot or an agent account applies the label, the check turns red. The guard that runs is always the one from `main`, so a PR cannot loosen it.

Limit: if the agent works with **your** GitHub account (the default today), to GitHub it **is** you, and the guard has no way to tell you apart. Then what applies is `AGENTS.md`, which forbids agents from touching the label, and the history in the Summary. To close this for good, see "Agent identity" below.

### CI costs

- **Public repository** (like this template): GitHub's standard runners are **free**.
- **Private repository:**
  - the Free plan includes 2,000 minutes per month, and Pro, 3,000;
  - beyond that, standard Linux costs $0.006 per minute.
- Each PR uses 3 jobs of about 1 minute each. Consecutive pushes on the same PR cancel the previous run, so minutes are not wasted.
- The weekly direction check uses less than 1 minute per week.

## Independent reviewer (check `review`)

Every **ready** PR (not drafts) gets an automated review, published as **one** comment on the PR. The reviewer is a model from **a different provider** than the agent that implemented it, because whoever wrote the text does not see their own mistakes.

### When the reviewer runs (and how much each run costs)

| Situation | What happens | Calls the model? |
|---|---|---|
| PR in **draft** (the agent is still working) | Nothing | No |
| PR marked **Ready for review** (or opened already ready) | **Full review** of the whole PR | Yes, once |
| **Push** after the review | Does not call the model. The check stays **red** until someone applies `re-review`, and the comment lists the unreviewed commits. This is the default: `afterReviewPush: "require-re-review"` in `.github/review.json`, the owner's decision. With `"keep-verdict"`, the push keeps the previous green and only turns red on: secret, sensitive path, open blocking finding, failed review or force-push | No |
| Label **`re-review`** (you or the agent apply it) | **Incremental review**: only the diff since the last reviewed commit, checking whether each previous finding was resolved. The label is removed on its own, so it can be applied again. A push and the label close together are safe: every run reads the labels on the PR when it starts (not the event), so the first run to start does the review and the other only recomputes the verdict, and both end with the same result (tested in `tests/unit/review-flow.test.ts`, "race") | Yes, smaller, once |
| Label `re-review` on a commit that was **already reviewed** | Recomputes the verdict and removes the label | No |
| **Approval label** added or removed (`approvalLabels` in `.github/review.json`: `invariant-approved`, `eval-approved`) | If findings are open, or the label removed was there at the last review: **full review**, because a finding like "invariant changed without approval" depends on the label and an incremental review would leave it pending. Otherwise, only recomputes the verdict | Yes, only in that case |
| Label **`deep-review`** (only you) | Full review with the strongest model (Opus) | Yes, more expensive |
| **Any other label** | Recomputes the verdict of the last review, without touching the comment. The job cannot be skipped: with the required check (M6), a skipped job would count as green on top of a red one | No |
| Repository in **no-key mode** (`disabled` in `.github/review.json`) | Green check with an "off" notice; only the secret detectors run. See [No-key mode](#no-key-mode) | No |
| PR from a **fork** | Red check with a notice: forks do not get secrets, so nobody reviewed it. Review it by hand | No |
| **Trivial** PR: only `README.md`, `CHANGELOG.md` and `docs/**/*.md`, or only a lockfile. It is never trivial if it touches a document that guides agents (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `specs/`, `docs/missions/`, `docs/HANDOFF.md`, `docs/SKILLS.md`, `SKILL.md`, `.claude/`) or a sensitive path | **Light** review (same model, short reasoning) or **none** (only the secret detectors), according to `trivial.mode` (`light` or `none`) in `.github/review.json` | Light or no |

The reviewed commit and the open findings are stored in the reviewer's own comment, invisibly. That is how the incremental review knows where to start.
- Nobody should edit that comment. If it is tampered with, the state is validated and, if invalid, ignored.
- A force-push that erases the reviewed commit turns the check red, and the next review goes back to being full.
- The incremental review only looks at the PR's files. A merge of `main` into the branch does not bring new files into the diff, but snippets from `main` **inside** the PR's files may show up.
- A finding in a file that left the PR (deleted, or reverted to what is on `main`) resolves on its own.

- **Secrets** are decided only by the detectors, which run over the whole PR on every run. The finding only goes away when the secret leaves the PR; the model never decides this.
- **Lockfiles** (`package-lock.json` and the like) are never sent to the model. They are covered by the `dependencies` check, which looks for known vulnerabilities. A lockfile-only PR gets no content review.

The end-to-end simulation of this flow, with a fake GitHub and a fake model, runs on every `npm test` (`tests/unit/review-flow.test.ts`).

### How it works

1. The workflow `.github/workflows/review.yml` computes the PR's diff.
2. **Secret filter, before anything is sent:**
   - `.env*` files (except `.env.example`), keys and certificates are **never** sent;
   - lines that look like a key or token become `[REDACTED]`;
   - a secret on an **added** line becomes a blocking finding without even asking the model.
3. **Choosing the tier:**

   | Tier | When | Default model | Secret |
   |---|---|---|---|
   | `standard` | Regular PR | DeepSeek `deepseek-v4-pro` | `REVIEW_API_KEY` |
   | `sensitive` | PR touches a sensitive path (`sensitivePaths` in `.github/review.json`: invariants, evals, CI, authentication, payment, AI…) | Claude `claude-sonnet-5-5` | `REVIEW_DEEP_API_KEY` |
   | `deep` | You apply the `deep-review` label | Claude `claude-opus-5-5` | `REVIEW_DEEP_API_KEY` |

   Without `REVIEW_DEEP_API_KEY`, the escalation does not happen: the standard tier reviews and the report **says so** explicitly.
4. The model receives `REVIEW.md` and `AGENTS.md` **from the target branch** (a PR does not loosen its own review) and replies in JSON.
   - These two files always come **at the start** of the prompt, and in the same way, in every review.
   - Providers with context caching, like DeepSeek, charge about 3% of the price for that repeated part.
   - On Anthropic (tiers `sensitive` and `deep`) caching is **not** turned on: writing to the cache costs 25% more and it lasts 5 minutes, which does not pay off for reviews spaced far apart.
   - The report shows how many tokens came from the cache.
5. A finding without evidence, or that cites a file outside the diff, is **discarded**, and the report counts how many were discarded.
6. Any **blocking** finding turns the `review` check red. Important findings and suggestions only show up in the comment.
7. If the reviewer fails (provider down, invalid reply, diff too large), the check turns **red** and the report says nothing was verified. An error never becomes "approved".

### Switching providers

- **Standard tier:** in Settings → Secrets and variables → Actions → **Variables**, create `REVIEW_API_BASE_URL` (any API in the OpenAI format) and `REVIEW_MODEL`. The key stays in the `REVIEW_API_KEY` secret.
- **Other tiers and limits:** edit `.github/review.json` (protected by CODEOWNERS). It holds:
  - the sensitive paths;
  - the maximum diff size (`maxDiffChars`);
  - the maximum wait time (`timeoutMs`);
  - the prices used in the cost estimate.

### Testing on your machine (without pasting the key anywhere)

```bash
read -s REVIEW_API_KEY        # paste the key and press Enter (nothing shows on screen)
printf 'REVIEW_API_KEY=%s\n' "$REVIEW_API_KEY" > .env.local
unset REVIEW_API_KEY
chmod 600 .env.local          # only you can read the file
npm run review:dry-run        # checks what would be sent, at no cost
npm run review:local          # real review of your branch
```

`.env.local` is in `.gitignore`, and Claude Code has no permission to read it (`.claude/settings.json`).

### Review canary

A **fake** PR with 6 planted defects (`scripts/review/canary/`):
- invariant turned off;
- `catch` that returns a free order;
- command from the customer's e-mail executed;
- key in the code;
- ✅ without evidence;
- stack trace shown to the customer.

The **Review canary** workflow runs on the 1st of every month, when a PR that changes the reviewer becomes ready (later pushes do not run it again, by the owner's decision), and on demand (Actions tab → Run workflow). It fails if any defect goes unnoticed.

This is how you find out whether a change of model or of criteria made the review worse.

Why a fake PR and not a real one: PRs opened by GitHub Actions itself do not trigger other workflows. A real PR created by the bot would not be reviewed.

### Costs

Each run's report shows the tokens used and the estimated cost. For reference, a medium-sized PR (about 20 thousand input tokens and 3 thousand output tokens) costs roughly:

| Model | Price (input / output, per million tokens) | Average PR |
|---|---|---|
| DeepSeek `deepseek-v4-pro` | $1.32 / 3.96 at peak; half off-peak | ≈ $0.04 |
| Claude `claude-sonnet-5-5` | $2 / 10 (cache read $0.10, not used) | ≈ $0.07 |
| Claude `claude-opus-5-5` | $4 / 20 (cache read $0.20, not used) | ≈ $0.14 |

An incremental review usually costs much less than a full one (estimate: about $0.03), because the diff is small and the start of the prompt comes from the cache. The canary costs one call per month, plus one for each push on PRs that change the reviewer. GitHub Actions minutes follow the CI table above (free in a public repository).

### Why not "max-turns"

The reviewer makes **one** call per run, with no tools and no loop. That is why it needs no turn limit (`--max-turns` only makes sense for agents that act in several steps). The limits that apply here are:
- maximum diff size;
- maximum wait time for a reply;
- `timeout-minutes: 15` on the job.

## Evals in CI (check `evals`)

When a **ready** PR touches AI files (`aiPaths` in `evals/config.json`), the `evals.yml` workflow:
1. runs the golden set with the real model (DeepSeek by default, key `EVAL_API_KEY`);
2. compares it with `main`, run now with the same model;
3. comments the table on the PR.

The check turns red:
- below the threshold;
- on a drop larger than the tolerated one;
- if golden set cases are deleted or changed, or a suite is removed, without the `eval-approved` label, which only you apply;
- if the `main` run (the baseline) fails, for example with the API down. Run the job again (**Re-run jobs** button) when it is back.

The evals run again on every push and every label applied to a PR that touches AI (less than $0.01 per run today). Skipping the job on a label would make the required check count as green.

A PR that does not touch AI does not call the model. Details, variables and costs: `evals/README.md`.

The review canary also gained two cases:
- **incremental review:** the model must not mark as "resolved" a finding that was not fixed, not even when there is a planted instruction asking for it;
- **light tier.**

## Protecting `main` (M6)

Analogy: `main` is the vault. The checks are the alarms; the protection rule is the door that only opens with every alarm green and through the right path (a PR), never from outside.

The file `.github/rulesets/protect-main.json` is the ready-to-import rule. It:

| Rule | Why |
|---|---|
| Nobody deletes `main` or force-pushes to it | History is not rewritten |
| Every change goes in through a PR | Neither you nor an agent pushes directly to `main` |
| Requires the checks `quality`, `invariants`, `dependencies`, `review` and `evals` to be green | Merge only when the robots agree |
| The checks must come from GitHub Actions (`integration_id` 15368) | Nobody forges a "green" through the API, not even an agent with your token |
| 0 required approvals | GitHub does not let the author approve their own PR, and today the agents use your account: with 1 approval, no PR would get in. **Your click on merge is the approval** (and, if the merge publishes, the deploy) |
| No "Require review from Code Owners" | Same reason: you are the author and the owner, and GitHub does not accept your own review |
| No "branch up to date before merge" | It would require updating the branch at every merge, and each update asks for a new paid review |
| Nobody on the exception (bypass) list | Not even you skip the checks. In an emergency, turn the rule off (Settings → Rules), do what is needed and turn it back on |

### How to turn it on (once, on GitHub)

1. Download `.github/rulesets/protect-main.json` to your computer (open the file on GitHub → **Download raw file** button).
2. In the repository: **Settings** → **Rules** → **Rulesets**.
3. **New ruleset** → **Import a ruleset** → choose the file.
4. Check on screen: name `protect-main`, **Enforcement status: Active**, target **Default branch**, and the 5 checks listed under "Require status checks to pass".
5. Click **Create**.

To check: open any PR. In the merge box, "Required" should appear next to the 5 checks, and the merge button only turns green when all of them pass.

### Private repository

Protection rules (rulesets or branch protection) work for free in **public** repositories. In a **private** repository they require the **GitHub Pro** plan (personal) or **Team** (organization). On the Free plan, in a private repository, the rule is not enforced (GitHub warns you on screen). Without Pro, the checks keep running and showing up on the PR; you only lose the lock. Then the discipline is yours: do not click merge with a red check.

### Agent identity

Today the agents (Claude Code in the cloud, Codex) open PRs and apply labels **with your account**. To GitHub, they are you. What this allows and how each option solves it:

| | A. Your account (current) | B. Bot account (e.g. `yourname-agent`) | C. GitHub App |
|---|---|---|---|
| Setup | None | One more free account, invited with the **Write** role, and a fine-grained token for your repositories only | Create and install an App; generate short-lived tokens |
| You formally approve the PR | No (author = you) | Yes: you can require 1 approval + Code Owners | Yes |
| Guard tells the agent's label apart | No | Yes: a label applied by the bot turns red | Yes |
| Agent can click merge | Yes (only `AGENTS.md` prevents it) | Only after your approval | Only after your approval |
| Cloud agents (Claude Code web, Codex cloud) | They are you | **They are still you**: they use their own GitHub app, with your account | Same |
| For whom | Solo dev getting started | Whoever uses **local** agents (CLI) often | Teams |

Recommendation: **A for now**, with the locks that hold even when the agent is you:
- required PR;
- required checks coming only from Actions;
- guard and reviewer running the `main` version;
- golden set and eval thresholds coming from `main`.

Move to **B** when you use local agents day to day or when another person joins the project. Then, in the rule: approvals = 1 and "Require review from Code Owners" on.

What still depends on discipline in option A:
- **Merge and labels:** an agent could merge or apply `invariant-approved` / `eval-approved`. `AGENTS.md` forbids it, and the label history stays in the job's Summary.
- **Workflows:** a PR can change workflows (GitHub runs the PR's version on `pull_request`). The reviewer treats `.github/` as a sensitive path and sends it to the strongest model; read those diffs carefully before the merge.
- **Secrets:** anyone with push access can, in a PR, write a workflow that reads a secret. Mitigation: only you and your agents have push access, and each key has a **spending limit** at the provider. Environments with manual approval for secrets would protect more, but would ask for a click from you on every review and every eval; for a solo dev, the spending limit is the better trade-off.
- **In Claude Code:** you can block merging from the terminal by adding `"Bash(gh pr merge:*)"` to the `deny` list in `.claude/settings.json`. The file is protected against edits by the agent, so this change is yours.

## Weekly direction check

Analogy: the GPS that, once a week, asks "is that still where you want to go?". Robots verify whether the code is **right**; only you verify whether it is going to the **right place**.

Every Monday at 08:23 (Brasília time), the **Direction check** workflow opens an issue with the `direction-check` label:
1. five questions for you (goal, acceptance criteria, non-negotiables, queue, spending);
2. health of `main`: latest run of CI and of the monthly canary;
3. the direction table from `specs/PRD.md`, with an automatic check: do the files cited as evidence exist? Was any requirement left without a row?
4. PRs merged during the week and open PRs, with an alert for those stalled for more than 7 days;
5. the queue and the pending decisions from `docs/HANDOFF.md`.

If the previous week's issue is still open, it is updated (and gets a comment, which notifies you) instead of opening another one. Close the issue when you are done.

It does not call an AI model and does not use secrets: it costs a few seconds of Actions. To run it right away: **Actions** tab → **Direction check** → **Run workflow**. To see the text without publishing: `node scripts/direction/run.ts --dry-run`.

## No-key mode

A project can start without any AI key. Then `quality`, `invariants` and `dependencies` run as usual, and `review` and `evals` stay required but pass with a clear "off" notice:

| Check | In no-key mode | Still runs without a key |
|---|---|---|
| `review` | Comment "Automated review is off in this repository" | Secret detectors: a key or `.env` file in the PR still turns the check red |
| `evals` (PR touches AI) | Comment "Evals off in this repository" | Golden set guard: deleting or changing cases still needs `eval-approved` |
| Review canary | Skipped with a notice | — |

**The switch** is a `disabled` field (the text says why) in `.github/review.json` and in `evals/config.json`. Copier writes it when you answer "None" for the reviewer or "no" for evals with a model.

**Why this does not reopen the "skipped check counts as green" gap** for projects that do have a key:
- The jobs never skip. They run on every event and decide; "off" is a decision written in the comment and in the job summary, not a missing check.
- "Off" is never inferred. A missing key without the switch is still an error and a **red** check, so a project with keys that loses one does not turn green silently (tested: "no-key mode is never inferred" in `tests/unit/review-flow.test.ts` and `tests/unit/evals-flow.test.ts`).
- The switch is read from the **target branch** (`main`), like the rest of the reviewer's config. A PR that adds `disabled` does not turn off its own review or evals; it is reviewed as usual, and the reviewer points it out to you ("This PR turns the automated review off"). After the merge, the change is in `main`'s history for anyone to see.

**Turning the AI checks on later:**
1. Create the key at the provider, with a **spending limit**.
2. In **your own terminal** (never in a chat with an agent): `gh secret set REVIEW_API_KEY` (and `gh secret set EVAL_API_KEY` for the evals). The command asks for the value without showing it.
3. Open a PR that removes the `disabled` field from `.github/review.json` and/or `evals/config.json`. That PR still runs in no-key mode (the switch comes from `main`); from the next PR on, the checks call the model.

## Creating a project from this template (Copier)

Analogy: the template is a cake mold with a few adjustable parts. Copier asks how you want each part (owner, language, reviewer, optional sections), pours the project out of the mold, and remembers the answers. Later it can bring improvements of the mold into the cake without touching the filling you added.

Requires [Copier](https://copier.readthedocs.io) 9.18.2 or newer (`pipx install copier`).

```bash
copier copy --vcs-ref HEAD gh:<template-owner>/ai-dev-template my-project
```

| Question | What it changes |
|---|---|
| Project name (and package name) | README, PRD title, `package.json` |
| GitHub owner | `.github/CODEOWNERS`; the invariant guard accepts `invariant-approved` only from this owner |
| Conversation language (`en` / `pt-BR`) | The `Conversation language` rule in `AGENTS.md` (the repository itself is always in English) |
| Reviewer provider | `.github/review.json`: DeepSeek with Claude on sensitive paths, Claude only, or none (no AI key: [no-key mode](#no-key-mode)) |
| Evals with a real model | `evals/config.json`: on (needs `EVAL_API_KEY`) or off ([no-key mode](#no-key-mode)). Defaults to on unless the reviewer is "none" |
| Optional sections | Context7 and UI/UX sections of `AGENTS.md` (section numbers adjust) |

What belongs to whom:

| Kind | Files | On `copier update` |
|---|---|---|
| **Project** | `README.md`, `specs/PRD.md`, `docs/HANDOFF.md`, `.github/CODEOWNERS`, `.env.example`, `src/`, `tests/invariants/`, the app's unit tests, `evals/golden/`, `evals/config.json`, `evals/targets.ts` | Never overwritten (recreated only if deleted) |
| **Template** | Workflows, reviewer, guard, direction check, `AGENTS.md`, `REVIEW.md`, `docs/WORKFLOW.md`, tooling tests | Merged: your edits are kept, template changes are added; conflicts show up as markers to resolve |
| **Template only** | `copier.yml`, `tests/template/`, `.github/workflows/template.yml` | Never copied into projects |

To bring template improvements into a project, on a clean working tree: `copier update --defaults`, review the diff, open a PR.

The `Template` workflow (job `template`) proves this on every PR of the template: the `.jinja` twins render back to this repository's own files, two projects with different answers pass their checks, no owner of the template leaks into them, and `copier update` brings a template change while keeping the project's PRD, app code and invariants.

## Still under construction

The sections below come in the next PRs:
- **M7b/M7c:** first day of a new project (`/new-project`, discovery, audit).
