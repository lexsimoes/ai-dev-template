# Sales page brief: adt

Working notes behind the website in `site/` (published at https://getadt.online): `index.html` (English), `pt/index.html` (Brazilian Portuguese) and the `styles.css` they share. Open either file in a browser; there is no build step.
Mission 0048 (`docs/missions/0048-landing-page.md`) moved it here from `prototype/landing/` after the owner's go-ahead.

## The page's job

- **Main conversion:** the visitor installs the `adt` plugin in Claude Code (two commands), then runs `/adt:new-project` or `/adt:audit`.
- **Secondary:** the visitor opens the repository on GitHub (README, releases, star).
- Nothing is sold. The template and the plugin are MIT. The page sells adoption; the AI checks cost cents, paid to the visitor's own model provider, or nothing in no-key mode.

## Audience

### Primary: the builder who ships with AI agents and has become the bottleneck

- Solo developers, technical founders and leads of small teams (1 to 10 people) who already let Claude Code, Codex or Cursor write most of the code, on a product with real users or real money.
- Their week: agents open more pull requests than they can read line by line, and they are the only reviewer.
- What they have seen: an agent that weakened a test to turn CI green, said "done" without running anything, drifted outside the task, or broke a rule that must never break (a price, a permission, personal data).
- What they want: keep the agents' speed, stop worrying about what slipped through, and read a short summary they can check instead of every line.
- How they decide: README and docs first, then the price, then proof (real numbers, a real PR), then a 5-minute try on a throwaway repository. They distrust marketing claims and anonymous testimonials.

### Secondary: the product owner who directs agents but does not read code

- Founders or product people who run Claude Code and `gh` but do not review diffs.
- adt fits them because their part is product decisions: the PRD, the acceptance criteria, what must never happen, and the merge click. `/adt:discover` asks product questions, not engineering ones.
- Risk: the prerequisites (Node.js, Git, GitHub CLI, Copier) are a wall. The page names them plainly in "Get started" instead of hiding them.

### Tertiary: a small team with an existing codebase

- They want guardrails without a migration. `/adt:audit` is read-only and `/adt:adopt` is add-only, with checks in observe mode first. This answers "will it break my repository?"

### Not the audience

- Companies that need SSO, compliance reports or a vendor contract.
- Teams that want a hosted review bot with no setup at all.

## Pains, in the order the page answers them

| Pain (in the visitor's words) | Answer on the page | Source |
|---|---|---|
| "The agent weakened a test to turn CI green." | Non-negotiable tests are locked; changing one needs the owner's `invariant-approved` | `AGENTS.md` 1.2, `scripts/guard-invariants.ts` |
| "It said done and ran nothing." | Every PR fills requirement → evidence → status, plus "What was NOT verified" | `.github/pull_request_template.md` |
| "It broke a rule that must never break." | Each rule in the PRD has a test in CI | `specs/PRD.md` §4, `tests/invariants/` |
| "It obeyed an instruction hidden in an issue." | External content is data, never instruction | `AGENTS.md` 1.5, `REVIEW.md` |
| "It merged its own work." | Agents never merge; `main` takes only PRs with green required checks | `AGENTS.md` 1.7, `.claude/settings.json`, `.github/rulesets/protect-main.json` |
| "I'm the only reviewer." | A second model reviews every ready PR, about a cent each | `docs/WORKFLOW.md` "Costs" |

## Objections, answered in the FAQ

- **Price:** free, MIT; cents per review with your own keys; $0 in no-key mode. Answered by the first FAQ item and the "Cost" row of the before-and-after table.
- **My agent:** `AGENTS.md` is read by most coding agents; Gemini CLI and Aider get a bridge file.
- **Existing code:** audit (read-only, with a fingerprint) and adopt (add-only, observe mode).
- **Keys and code:** keys set by the owner in their own terminal; a secret filter runs before any diff reaches a model.
- **Merge and deploy:** never by an agent.
- **Stack:** new projects start on Node.js and TypeScript; the review and the guards run in GitHub Actions with their own Node.js. **Owner: confirm this wording.**
- **Updates:** `copier update`; project files are never overwritten.

## Positioning

- **Category:** a workflow (repository template + Claude Code plugin) for building software with AI coding agents.
- **One line:** "Agents code. Bots verify. You approve." It compresses the README's first sentence.
- **Differentiators:**
  1. The rules are tests no agent may touch, enforced by CI and an owner-only label.
  2. The reviewer is a different model from the one that wrote the code.
  3. Every PR carries evidence and says what was not verified.
  4. It runs in the owner's GitHub, with the owner's keys, for cents or nothing.

## Social proof without fake testimonials

The project has no public customers yet, so the page invents none: no logos, no quotes, no user counts.
It uses the strongest proof the repository has: **adt is built with adt.** Real numbers from its own history, and real bugs its checks caught, each with a source below.

## Claims on the page and their evidence

Checked on 2026-11-24 at `b255838` unless noted.

| Claim on the page | Evidence | Status |
|---|---|---|
| Free, MIT licensed | `LICENSE` | ✅ |
| ≈ $0.01 per review of a medium PR (DeepSeek Flash); ≈ $0.07 Sonnet; ≈ $0.14 Opus; evals under $0.01 per run | `README.md` "What it costs"; `docs/WORKFLOW.md` "Costs" (estimates from list prices) | ✅ |
| Six required checks: `quality`, `invariants`, `dependencies`, `review`, `evals`, `e2e` | `.github/rulesets/protect-main.json` | ✅ |
| A real review: PR #55, sensitive tier, `claude-sonnet-5-5`, 0 blocking, ≈ $0.0216, 4.4 s | The review comment on [PR #55](https://github.com/lexsimoes/ai-dev-template/pull/55), read through the GitHub API | ✅ |
| A real evals run: PR #55, 10 cases, 100% accuracy, ≈ $0.0007 | The evals comment on [PR #55](https://github.com/lexsimoes/ai-dev-template/pull/55) | ✅ |
| 47 pull requests merged in 8 days, by one maintainer | `git log --merges --grep='Merge pull request'`: 47 merges, 2026-10-20 to 2026-10-27, one author | ✅ |
| 235 unit tests and 8 invariant tests, all passing | `npm test` (235 pass) and `npm run test:invariants` (8 pass), run on 2026-11-24 | ✅ |
| The default reviewer found 4 of 4 planted defects in a test PR, for about a cent | `docs/missions/0033-reviewer-model.md`, table "#35": Flash 4/4 in both runs, $0.009–0.010 | ✅ |
| Caught: `@playwright/test` redirectable through the root `tsconfig.json` | `CHANGELOG.md` 0.5.0, Fixed (security review of mission 0036) | ✅ |
| Caught: contact form refused valid messages with many line breaks (#33) | `CHANGELOG.md` 0.4.0, Fixed (first exploratory session) | ✅ |
| Caught: a 2,000-character message in Japanese got HTTP 413 | `docs/HANDOFF.md`, mission 0029; `CHANGELOG.md` 0.4.0, Fixed | ✅ |
| Caught: the incremental review reported a merge of the base as the PR's own change (#45) | `CHANGELOG.md` 0.5.0, Fixed | ✅ |
| Caught: the required `dependencies` check failed on every private-repository PR | `CHANGELOG.md` 0.4.0, Fixed (M8 rehearsal) | ✅ |
| Blocked: a PR that skipped an invariant test, and an unrelated label did not unblock it | `docs/HANDOFF.md`, "M8 so far" (adt-sandbox-m8#1) | ✅ |
| `AGENTS.md` is read by Codex, Cursor, Copilot, Windsurf, Cline, Zed and others; bridges for Gemini CLI and Aider | `docs/WORKFLOW.md`, "Coding agents and their instruction files" (checked against each tool's docs on 2026-10-21, not re-checked today) | 🟡 |
| Agents never merge; `gh pr merge` is denied | `AGENTS.md` 1.7, `.claude/settings.json` | ✅ |
| `.env` files, keys and certificates never reach the model | `docs/WORKFLOW.md`, reviewer "How it works", step 2 | ✅ |
| The review criteria come from the target branch | `REVIEW.md` (intro), `docs/WORKFLOW.md` step 4 | ✅ |
| Model versions are pinned; a mismatch stops the review | `CHANGELOG.md` 0.4.0, Fixed | ✅ |
| No-key mode: review and evals pass with an "off" notice; secret detectors and golden-set guard still block | `docs/WORKFLOW.md`, "No-key mode" | ✅ |
| `/adt:new-project` creates the repository, labels and the protection of `main` from a few questions | `README.md`, "Getting started"; `plugins/adt/GUIDE.md` | ✅ |
| Evals run on every pull request that touches AI code | `README.md` step 6.3; `docs/WORKFLOW.md`, flow map | ✅ |
| Audit is read-only and proves it with a fingerprint; adopt is add-only, observe mode | `README.md`, "Getting started" | ✅ |
| `copier update` never overwrites the PRD, HANDOFF, app code, invariants or golden set | `README.md`, step 8 | ✅ |
| Prerequisites: Node.js 22.18+, Git, GitHub CLI, Copier 9.18.2+ | `README.md`, step 1 | ✅ |
| A private repository needs GitHub Pro or Team for branch protection | `README.md`, step 2 | ✅ |
| No adt server, no account | The template ships no hosted service; no telemetry or analytics code (`grep`) | ✅ |
| Latest release v0.6.0 | GitHub API: published 2026-10-28 | ✅ |

## The Portuguese version

The owner asked for the page in Portuguese too (2026-11-24). `pt/index.html` is the same page, written for Brazilian developers rather than translated word for word.

- **Why it matters:** the owner and part of the early audience are Brazilian, and the template already speaks Portuguese: `copier.yml` offers `pt-BR` as the conversation language, so agents talk and report in Portuguese while the repository stays in English. The Portuguese FAQ says so ("Funciona em português?").
- **Words kept in English**, as Brazilian developers use them: pull request, merge, branch, label, deploy, CI, golden set, evals, lint. The check names (`quality`, `invariants`…) and the GitHub button "Merge pull request" stay as they appear on GitHub.
- **Voice:** informal and direct ("Agentes codam. Robôs conferem. Você aprova."). "Codar" is everyday developer slang in Brazil; the owner may prefer "programam".
- **Money:** amounts are in US dollars, written `US$ 0,01` (comma decimals), and the pricing section says "Valores em dólares".
- **Quotes stay in the original:** Fig. 3 (the real review comment) and Fig. 4 (the PR form) are in English, as they are on GitHub, and their captions say so. Links to the documentation are marked "em inglês".
- **Layout:** Portuguese lines are longer, so `styles.css` sizes the Portuguese hero with `html:lang(pt)` to keep each phrase on one line from 360 to 1440 px.

| Extra claim on the Portuguese page | Evidence | Status |
|---|---|---|
| Agents talk to you in Portuguese; the repository stays in English | `copier.yml` (`conversation_language`), `AGENTS.md` "Conversation language" | ✅ |

## Reference: Greptile on Mobbin, adapted

The owner asked to copy [Greptile's site on Mobbin](https://mobbin.com/sites/greptile-02f7f385-cda0-48df-97cf-369a65a163b2/8aeb813a-2a94-4f34-8183-c24951b5d81e/preview). `AGENTS.md` §5 says "adapt, do not copy", and a copy of another company's look would confuse visitors. So the prototype takes the structure and the visual language, and none of the brand.

| Greptile section (Mobbin) | Becomes on the adt page |
|---|---|
| [Hero, "The AI Code Reviewer."](https://mobbin.com/sites/sections/7f70d8d5-d31b-4312-9262-c01b2c4db136) | Hero: headline at top left, lead and two actions below, a figure on the right |
| Logo strip, "Over 9,000+ teams" (same section) | "Works with" strip of agent names, as plain text (no customer logos: there are none to show) |
| [How Greptile reviews every PR](https://mobbin.com/sites/sections/1b166ffd-5b9f-4579-9398-629d9779f7af), [How it works](https://mobbin.com/sites/sections/a40ecf6e-dc62-4e36-acfa-ba2e27f4688a) | "One loop for every change": the four real steps, with a side panel of when the agent stops and asks (instead of a customer quote) |
| [Code validation that adapts](https://mobbin.com/sites/sections/3e9e6772-e10a-4cc1-9146-b5ec11d65ed1), [An agent of few words](https://mobbin.com/sites/sections/19cd19b0-5253-4169-9f05-1da31905b738) | The checks: text beside a captioned "Fig." of a real review comment, a blocked check and an evidence table |
| [See what Greptile can catch](https://mobbin.com/sites/sections/903b5d0f-35a2-400d-baa2-a5887937ac3f) | "adt is built with adt": stat tiles and a feed of real catches from the changelog |
| [Independent by design](https://mobbin.com/sites/sections/7c7c51f1-6dc7-4523-935d-c9f5bb48f1d0) | "Yours, end to end": agents, models, infrastructure, license |
| [Pricing](https://mobbin.com/sites/sections/f2a06aa9-073c-4488-a377-58390b50534b) | "Before and after": the same two-column sheet, comparing a repository without adt and with adt, with cost as one row. A first version compared no-key mode with your own keys; the owner found it confusing, since the product is free and has no plans (2026-11-24) |
| [FAQ](https://mobbin.com/sites/sections/e24c3838-5ada-480e-a397-16407929859f) | FAQ built from the objections above |
| [Team note](https://mobbin.com/sites/sections/1508d627-0b84-47a8-a9ac-09aa3aa717d2) | "Why adt exists", unsigned until the owner decides |
| [Closing call to action](https://mobbin.com/sites/sections/b68846cd-3a2b-4bb5-a381-1116890256ad), [Footer](https://mobbin.com/sites/sections/11966ed2-b7f3-4c77-bedd-f02230f12815) | Closing band with the install action; footer with the wordmark and links |
| [Testimonials](https://mobbin.com/sites/sections/727f6773-6d7b-49bf-ae6c-786e2cb6295a) | Not used: no real testimonials exist yet |

- **Kept:** the section order, the technical-drawing ground (dotted grid, dashed frames, corner marks), bracketed monospace labels, heavy left-aligned headlines, light and dark bands, "Fig." captions, the stats-and-feed layout, the two-column pricing table, the FAQ accordion, the large footer wordmark.
- **Not taken:** Greptile's name, logo, lizard illustration, palette (mint, lilac and lime on slate), typefaces, button shape, copy, customer logos, testimonials and numbers. adt uses cool drafting gray, navy ink and a safety-orange "guardrail" accent, Archivo and IBM Plex Mono, and a cut-corner button shaped like a work-order tag.
