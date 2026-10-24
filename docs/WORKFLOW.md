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
| `npm start` | Runs the demo app on http://127.0.0.1:3000 |
| `npm run e2e` | End-to-end tests of the critical flows, in the isolated mode (fake AI provider). The first time: `npx playwright install chromium` |
| `npm run eval:mock` | Evals at no cost (tests only the plumbing) |
| `npm run eval` | Evals with the provider from `LLM_PROVIDER` |
| `npm run review:dry-run` | Shows what the reviewer would send (files, redacted secrets, tier, size) without calling any model |
| `npm run review:local` | Reviews your branch against `main` with the real model (needs `.env.local`) |
| `npm run review:canary` | Runs the review canary with the real model (needs `.env.local`) |

## CI: the robots on each PR

The file `.github/workflows/ci.yml` runs on its own on every PR (drafts included) and on every push to `main`. There are 4 independent jobs, each on its own machine:

| Check | What it verifies | Fails when |
|---|---|---|
| `quality` | Installs with `npm ci`, runs lint, types and unit tests | Code out of standard, type error or broken test |
| `invariants` | Runs the guard (`scripts/guard-invariants.ts`) and the tests in `tests/invariants/` | A non-negotiable broke, one of its tests was skipped, or the folder changed without the `invariant-approved` label |
| `dependencies` | Checks **only the dependencies the PR adds or changes**: GitHub's dependency review in a public repository, `npm audit` of what the PR introduces in a private one | One of them has a known vulnerability of high or critical severity |
| `e2e` | Runs the end-to-end tests of the critical flows (`e2e/`) in a real browser, against the app in its isolated mode, except tests in quarantine (they run in `e2e-quarantine`, which is not required) | A critical flow broke, or a test tried to leave the isolated environment |

Two more jobs serve `e2e` and are not required: `e2e-quarantine` (tests in quarantine) and `e2e-flaky` (pushes to `main` only); see "Flaky tests".

These four, plus `review` and `evals`, are **required checks** when the `main` protection rule is on (see "Protecting `main`"): with any of them red, the merge button is locked.

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
| Label **`re-review`** (you or the agent apply it) | **Incremental review**: only the diff since the last reviewed commit, checking whether each previous finding was resolved. The label is removed on its own, so it can be applied again. A push and the label close together are safe: every run reads the labels and the head commit of the PR when it starts (not the event). The first run for the PR's head does the review and the other only recomputes the verdict; a run whose event still carries the previous commit changes nothing and leaves the label to the run of the head (tested in `tests/unit/review-flow.test.ts`, "race") | Yes, smaller, once |
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
- The incremental review only looks at what the PR's own commits changed since the last review. It starts from the last reviewed commit merged with the base the PR has now, so a merge of `main` into the branch brings nothing from `main` into the diff, not even inside the PR's own files (a shared changelog, for example). When that merge conflicts, the PR resolved it by hand, so the review shows every change since the reviewed commit and says so in its notes.
- A finding in a file that left the PR (deleted, or reverted to what is on `main`) resolves on its own.

- **Secrets** are decided only by the detectors, which run over the whole PR on every run. The finding only goes away when the secret leaves the PR; the model never decides this.
- **Lockfiles** (`package-lock.json` and the like) are never sent to the model. They are covered by the `dependencies` check, which looks for known vulnerabilities. A lockfile-only PR gets no content review.

The end-to-end simulation of this flow, with a fake GitHub and a fake model, runs on every `npm test` (`tests/unit/review-flow.test.ts`).

### After the review: what the implementer fixes on its own

The implementer handles the findings before reporting to you (`AGENTS.md`, "Handle the review"):
- It fixes only the obvious ones, in a separate commit `fix: address review findings`, and only when the fix keeps the intended behavior.
- It lists, never fixes, anything that changes behavior, architecture or a public interface, anything in the invariants, the golden set, migrations or permissions, likely false positives and contradicting findings.
- More than ~5 fixes or ~10 files: it stops and asks you first.
- Then it pushes, applies `re-review`, and reports: fixed, not fixed (with its suggestion), your decisions, and the reviewer's cost.

Two commands keep the boundary deterministic (`scripts/review/triage.ts`):
- `findings --pr <n>` reads the reviewer's comment and splits the open findings into candidates and "never auto-fix", by path (`autoFix.neverPaths` in `.github/review.json`, which can only add to the defaults: invariants, golden set, eval thresholds, `AGENTS.md`, `REVIEW.md`, the invariant guard, migrations, `.github/`, `.claude/`, `CODEOWNERS`) and origin (a detected secret is always yours: the key must be rotated).
- `check-fix` (run by the agent before pushing, and again by the required `invariants` check on every commit titled `fix: address review findings`, with the checker taken from the target branch) refuses a fix commit that touches a protected path, goes over the cap, removes assertions or skips a test, and anything it cannot read (a merge, a file name it cannot match). The test checks are a heuristic: an assertion rewritten into a weaker one, or a conditional skip such as `skipIf`, is not caught; the re-review reads the fix.

Whether a candidate is really "obvious" stays the implementer's judgment; the re-review reads the fix commit. Tested with planted findings in `tests/unit/review-triage.test.ts`.

### How it works

1. The workflow `.github/workflows/review.yml` computes the PR's diff.
2. **Secret filter, before anything is sent:**
   - `.env*` files (except `.env.example`), keys and certificates are **never** sent;
   - lines that look like a key or token become `[REDACTED]`;
   - a secret on an **added** line becomes a blocking finding without even asking the model.
3. **Choosing the tier:**

   | Tier | When | Default model | Secret |
   |---|---|---|---|
   | `standard` | Regular PR | DeepSeek `deepseek-flash` | `REVIEW_API_KEY` |
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

- **Standard tier:** in Settings → Secrets and variables → Actions → **Variables**, create `REVIEW_API_BASE_URL` (any API in the OpenAI format), `REVIEW_MODEL` and `REVIEW_MODEL_VERSION` (the version to pin, below). The key stays in the `REVIEW_API_KEY` secret.
- **Other tiers and limits:** edit `.github/review.json` (protected by CODEOWNERS). It holds:
  - the sensitive paths;
  - the maximum diff size (`maxDiffChars`);
  - the maximum wait time (`timeoutMs`);
  - the prices used in the cost estimate.

**Pinned versions.** A model name at a provider is often an alias (`deepseek-flash`, `deepseek-v4-pro`) that can move to a new model upstream, without notice. Each tier names the version its canary measured:
- **`pinnedVersion`:**
  - For an OpenAI-format provider, it is the `name` the provider lists for the model in `{baseUrl}/models` (DeepSeek: `DeepSeek-V4.1-Flash`). Before paying for a call, the reviewer checks it: if the alias now serves another model, the review stops with a red check and says so. It also checks the reply's `model`.
  - For Anthropic, it is the model id. A reply from any other model, for example a server-side fallback, is discarded.
- **`pinnedFingerprint`** (DeepSeek's `system_fingerprint`): a change warns in the report and opens one issue per new fingerprint, saying how to measure it (the review canary) and when to update the pin. The review goes on, since the provider's own deploys change the fingerprint too. A new model name still stops the review. The reviewer and the canary need `issues: write` for this; without it the report says the issue could not be opened.
- **To move to a new version:** run the review canary with it (Actions → Review canary, or a PR that changes `.github/review.json`), compare, then update `model`, `pinnedVersion`, `pinnedFingerprint` and `pricePerMTok` in one PR.
- A tier without `pinnedVersion` still works; the report notes that a change would go unnoticed.
- Changing only `REVIEW_API_BASE_URL` keeps the pins: the new provider's `/models` must list the same name, or the review stops. For another model, set `REVIEW_MODEL` and `REVIEW_MODEL_VERSION` too.

**DeepSeek options** (list prices at peak, per million tokens; off-peak is half):

| `model` | `pinnedVersion` | `pinnedFingerprint` (2026-10-23) | Input / cached / output |
|---|---|---|---|
| `deepseek-v4-pro` (V4-Pro-0813) | `DeepSeek-V4-Pro` | `a307abda487cd1b463329ccb945ce396` | $1.32 / $0.044 / $3.96 |
| `deepseek-flash` (V4.1-Flash-1017, the default) | `DeepSeek-V4.1-Flash` | `e72d3c7f663d3e1383b00b3884cb4501` | $0.30 / $0.006 / $1.20 |

The two were compared on 2026-10-23 (`docs/missions/0033-reviewer-model.md`): the same planted defects found, Flash about 4 to 5 times cheaper and 2 to 3 times faster. Flash is the default since mission 0034. To go back to Pro, change the four fields of the `standard` and `light` tiers to the Pro row, in one PR (its canary measures it).

DeepSeek has no dated id, so the pin is the name, not the release: a new release under the same name (say, a V4.1-Flash after 1017) passes `pinnedVersion` and shows as a new fingerprint: a warning and an issue.

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
| DeepSeek `deepseek-flash` (default) | $0.30 / 1.20 at peak; half off-peak | ≈ $0.01 |
| DeepSeek `deepseek-v4-pro` | $1.32 / 3.96 at peak; half off-peak | ≈ $0.04 |
| Claude `claude-sonnet-5-5` | $2 / 10 (cache read $0.10, not used) | ≈ $0.07 |
| Claude `claude-opus-5-5` | $4 / 20 (cache read $0.20, not used) | ≈ $0.14 |

An incremental review usually costs much less than a full one (estimate: under $0.01 with Flash, about $0.03 with Pro), because the diff is small and the start of the prompt comes from the cache. The canary costs one call per month, plus one for each push on PRs that change the reviewer. GitHub Actions minutes follow the CI table above (free in a public repository).

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

## End-to-end tests (check `e2e`)

A few tests (3 to 8) walk through the **critical flows** of the PRD in a real browser: what a customer must always be able to do, and what must never happen. Each test title starts with its requirement (`CA-02`, `INV-001`…). They are not a full regression suite, and AI quality is not their job (that is the evals').

**Isolated, always:**
- Playwright starts the app itself with `APP_ENV=e2e` (`playwright.config.ts`), and never reuses a server already running.
- In that mode the app accepts only the fake AI provider (`LLM_PROVIDER=mock`) and refuses to start with a real one (`src/web/server.ts`). No secret reaches the `e2e` job.
- Every browser request outside the app is blocked and fails the test (`e2e/fixtures.ts`). Tests import `test` and `expect` from there.

**Who writes them:** the Playwright test agents (`.claude/agents/playwright-test-*.md`, generated by `npx playwright init-agents --loop=claude` for the pinned version, with the project's rules appended at the end):
- **planner**: explores the app from the seed (`e2e/seed.spec.ts`) and writes a plan in `specs/e2e/`;
- **generator**: turns the plan into tests in `e2e/`, checking each step in the browser;
- **healer**: repairs a failing test. It may update **selectors only**. Changing what a test asserts, or removing a test, needs your `test-approved` label; it never marks a test `fixme` or `skip`.

**The guard** (`scripts/guard-e2e.ts`, first step of the `e2e` job, run from the target branch before any PR code) enforces it:
- in an existing spec, only selectors may change: comments and formatting are ignored, and every locator chain (`page.getByRole(...)`, `x.locator(...).filter(...)`, `.first()`, `.nth(...)`) counts as one selector. Anything else (an assertion, an expected value, a wait, a step, an import, a `return`, a `try`, a route) needs your `test-approved` label;
- deleting or renaming a spec, adding or changing any other file in `e2e/` (fixtures, helpers) or `playwright.config.ts` also needs it;
- a new spec needs no label if it imports only from `./fixtures.ts` and does not route, mock or reconfigure the browser;
- skipping, focusing or switching off a test (`.skip`, `.only`, `.fixme`, `.fail`, on any receiver, also `testInfo.skip()` or `["skip"]`) always fails, label or not: a flaky test goes to quarantine, never off;
- the label counts only when the last person who applied it owns `e2e/` (or, without such a rule, `tests/invariants/`) in the target branch's `CODEOWNERS`.

The job installs with `npm ci --ignore-scripts` and calls `npx --no playwright test` directly, so a PR's `package.json` cannot run code after the guard or swap the test command. It passes `--tsconfig=e2e/tsconfig.json`, so only that protected file applies to the config and the tests: Playwright otherwise uses the nearest `tsconfig.json`, and `paths` in the root one (which a PR may change) could redirect `@playwright/test`, for example to an `expect` that accepts anything.

It reads the specs with the TypeScript parser, as syntax trees, never as text (the owner's choice after two review rounds found holes in a hand-written reader). CI installs the TypeScript version pinned by the target branch's lockfile, with its integrity checked, in a folder of its own and before any PR code. A file that does not parse is never taken as unchanged. A locator argument is masked only when it is plain data; a call, an arrow, `await` or a function inside it counts as a change. Aliases, computed keys (`x[k]`, `x?.[k]`, `{ [k]: v }`) and dynamic access (`Reflect`, `eval`, `require`, `import()`) that could hide a skip fail too.

What it does not catch: a locator pointed at a different element (that is what a selector change is), or a dependency swap in the lockfile (the `dependencies` check and the reviewer see it).

The agents use the Playwright MCP server in `.mcp.json` (Claude Code asks you to approve it the first time). After updating `@playwright/test`, regenerate the agents, then reapply the project's edits: the "Project rules" section at the end, the healer's lines that said "fix assertions" and "mark `test.fixme()`", and no `browser_run_code_unsafe` for the planner. `tests/unit/web.test.ts` fails if any is missing.

**Run them:** `npx playwright install chromium` once, then `npm run e2e`. On a failure in CI, the job keeps the report (`playwright-report`) for 7 days.

### Flaky tests

A test that fails and then passes on a retry (CI retries twice) is **flaky**. The `e2e` check stays green, but it is never ignored:
- every run lists the flaky tests in the job summary ("Flaky tests (passed only on a retry)");
- on a push to `main`, the `e2e-flaky` job opens one issue per flaky test (title `Flaky end-to-end test: <test>`, with the run and the error), or comments "Flaky again" on the open issue with the same title. It is the only job with `issues: write`, and it never runs on a PR. The error text in the issue is data from the run, not instructions.

Then you choose:
1. **Fix it** (the usual way): a mission finds the cause (a missing wait, shared state, timing). The test stays in the required check meanwhile.
2. **Quarantine it**, when it blocks work: in a PR with your `test-approved` label, the test gets
   ```ts
   test("CA-04: …", { tag: "@quarantine", annotation: { type: "issue", description: "https://github.com/<owner>/<repo>/issues/<n>" } }, async ({ page }) => { … });
   ```
   The required `e2e` check then leaves it out (`--grep-invert @quarantine`); the `e2e-quarantine` check, which is **not** required, still runs it on every PR and push, so you see when it is stable again.

The guard holds quarantine to this: a quarantined test (the tag, or `@quarantine` in its title) without an `issue` annotation pointing at an issue of this repository fails; in a PR, a closed issue fails too ("Remove the tag"): fixing the test and closing the issue brings it back to the required check. Adding the tag changes the test, so it needs `test-approved` like any other change. Never `skip`, `fixme` or delete a flaky test.

### Exploratory session (on request)

Off by default: it runs only when you ask, in Claude Code with `/explore <area>` (for example `/explore checkout coupons`). Other agents follow the same file, `.claude/skills/explore/SKILL.md`.
- The agent opens the app in its isolated mode (the seed `e2e/seed.spec.ts`, fake AI provider, no outside requests) and tries what the end-to-end tests do not: odd inputs, back and reload, double submits, keyboard only, error messages.
- A finding must break a PRD requirement or a rule of `AGENTS.md`, and reproduce twice. At most 5 per session; nothing is fixed.
- `node scripts/explore-report.ts explorations/session.json` publishes them:
  - the screenshots and a `REPORT.md` go to a new branch, `exploration/<date>-<topic>`, as one commit with no parent: no code, never `main`, never replaced;
  - each finding becomes an issue titled `Exploration: <title>`, with steps, expected and actual result, and the screenshots shown from that branch. The GitHub API cannot attach images to an issue, hence the branch;
  - an open issue with the same title is not opened again. `@` mentions and `#` links from the page are neutralized.
  - `--dry-run` checks the file and prints the issues without pushing or opening anything.

You confirm or close each issue. A confirmed bug becomes a mission: the generator writes an end-to-end test that reproduces it (it fails first), then the fix, in one PR. Delete the `exploration/` branch once its issues are closed.

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

GitHub's dependency review needs **Advanced Security** (paid) in a private repository. There, the `dependencies` check runs `scripts/dependency-audit.ts` instead: `npm audit` on the PR's lockfile and on the target branch's, failing only on a high or critical advisory the PR introduces. It audits a copy of `package.json` and `package-lock.json` against the public npm registry (the PR's `.npmrc` is not read), installs nothing, and the checker comes from the target branch.

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
| `review` | Comment "Automated review is off in this repository" | Secret detectors: a key or `.env` file in the PR still turns the check red, and the comment then opens with "Blocked: possible secret" and the steps to fix it |
| `evals` (PR touches AI) | Comment "Evals off in this repository" | Golden set guard: deleting or changing cases still needs `eval-approved`; the comment then opens with "blocked: golden set weakened" and the two ways out |
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

## Coding agents and their instruction files

`AGENTS.md` is the only copy of the rules. Most agents read it on their own; the two that do not get a small bridge that points to it, never a second copy (checked against each tool's docs on 2026-10-21):

| Agent | Reads `AGENTS.md` | Bridge in this repository |
|---|---|---|
| Codex, Cursor, Antigravity (IDE and CLI), GitHub Copilot (cloud agent, CLI, VS Code), Windsurf, Cline, Zed, Jules, Amp, Kilo Code, Roo Code | On its own | None |
| Claude Code | On its own when there is no `CLAUDE.md`, from v2.1.277 | `CLAUDE.md` imports it (`@AGENTS.md`) and adds the Claude Code notes |
| Gemini CLI | No (reads `GEMINI.md`) | `.gemini/settings.json` makes it load `AGENTS.md` |
| Aider | No | `.aider.conf.yml` loads `AGENTS.md` as read-only context |
| Copilot Chat in Visual Studio, JetBrains, Eclipse, Xcode | No | None: it would need a full copy in `.github/copilot-instructions.md`, which would drift and would make Zed stop reading `AGENTS.md` |

## Creating a project from this template (Copier)

Analogy: the template is a cake mold with a few adjustable parts. Copier asks how you want each part (owner, language, reviewer, optional sections), pours the project out of the mold, and remembers the answers. Later it can bring improvements of the mold into the cake without touching the filling you added.

Requires [Copier](https://copier.readthedocs.io) 9.18.2 or newer (`pipx install copier`).

```bash
copier copy gh:<template-owner>/ai-dev-template my-project
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
| **Template notice** | `THIRD_PARTY_NOTICES.md` (the template's MIT notice; it does not set your project's license) | Kept and updated from the template, like the files below; do not delete it |
| **Project** | `README.md`, `specs/PRD.md`, `docs/HANDOFF.md`, `.github/CODEOWNERS`, `.env.example`, `src/`, `tests/invariants/`, the app's unit tests, `evals/golden/`, `evals/config.json`, `evals/targets.ts` | Never overwritten (recreated only if deleted) |
| **Template** | Workflows, reviewer, guard, direction check, `AGENTS.md`, `REVIEW.md`, `docs/WORKFLOW.md`, tooling tests | Merged: your edits are kept, template changes are added; conflicts show up as markers to resolve |
| **Template only** | `copier.yml`, `tests/template/`, `.github/workflows/template.yml`, `LICENSE`, `CHANGELOG.md`, `docs/RELEASING.md`, the release and traffic scripts | Never copied into projects |

Copier uses the template's latest **release** tag, never unreleased commits on `main` (`--vcs-ref vX.Y.Z` picks a version). To bring template improvements into a project, on a clean working tree: `copier update --defaults` (moves to the latest release), read the template's changelog for entries marked **Action needed**, review the diff, open a PR.

The `Template` workflow (job `template`) proves this on every PR of the template: the `.jinja` twins render back to this repository's own files, two projects with different answers pass their checks, no owner of the template leaks into them, and `copier update` brings a template change while keeping the project's PRD, app code and invariants.

## Still under construction

The sections below come in the next PRs:
- **M7b/M7c:** first day of a new project (`/new-project`, discovery, audit).
