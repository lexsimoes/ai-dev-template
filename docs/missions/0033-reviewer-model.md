# Mission 0033: reviewer model pinned; deepseek-flash compared with deepseek-v4-pro

**Status:** in review
**Branch:** `mission/0033-reviewer-model` · **PR:** see the PR of `mission/0033-reviewer-model`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("compare … report side by side … If Flash matches or beats Pro with zero false positives, make it the default and keep Pro as an option. Also make the reviewer config state the pinned version, so an upstream alias change never silently switches models.")

## Goal

The reviewer never reviews with a model nobody measured: each tier states the version its canary measured, and an upstream alias change stops the review instead of switching silently. The choice between Pro and Flash rests on a side-by-side measurement.

## Context

- **The two models.** DeepSeek's `deepseek-flash` now points to DeepSeek-V4.1-Flash-1017, and `deepseek-v4-pro` to V4-Pro-0813 (pricing page, 2026-10-23).
- **No dated ids.** DeepSeek's API offers no dated id to request. Its `/models` lists `name: DeepSeek-V4-Pro` and `DeepSeek-V4.1-Flash`. A reply's `model` is the alias. Its `system_fingerprint` is stable per model: `a307abda…` (Pro), `e72d3c7f…` (Flash).
- **The Anthropic tiers** ask for server-side fallback, which can answer with another model.

## Items

- [x] 1. Comparison: rehearsal PR #39, closed unmerged.
  - The same inputs and prompts for both models, 2 runs each: the canary `full`, `light` and `incremental`, and the planted-defect diff of #35 (its own branch, `REVIEW.md` and prompts).
  - Results below and on #39.
- [x] 2. `pinnedVersion` and `pinnedFingerprint` per tier (`scripts/review/lib.ts`, `providers.ts`, `run.ts`):
  - before a paid call, the provider's `/models` name must match the pinned version, or the review stops with a red check;
  - a reply from another model (a redirect, or Anthropic's fallback) is discarded, also red;
  - a new fingerprint only adds a note;
  - an unpinned tier gets a note.
  - `REVIEW_MODEL` now needs `REVIEW_MODEL_VERSION` to be pinned.
- [x] 3. `.github/review.json` and its twin pin every tier, and a test requires it of every shipped config:
  - DeepSeek: `DeepSeek-V4-Pro` and its fingerprint;
  - Anthropic: `claude-sonnet-5-5`, `claude-opus-5-5`.
- [x] 4. Docs: `docs/WORKFLOW.md` ("Switching providers": pinned versions, the DeepSeek options with prices), `CHANGELOG.md`, `docs/HANDOFF.md`.
- [ ] 5. Default model: **left as `deepseek-v4-pro`, pending the owner's decision** (see the report).

## Comparison (2 runs each)

Cost is recomputed at DeepSeek's list price (peak): Pro $1.32 input / $0.044 cached / $3.96 output per M tokens; Flash $0.30 / $0.006 / $1.20.

| Case | `deepseek-v4-pro` | `deepseek-flash` |
|---|---|---|
| Canary `full`: planted defects | 6/6, 6/6 | 6/6, 6/6 |
| Canary `light`: planted defects | 6/6, 6/6 | 6/6, 6/6 |
| Canary `incremental`: verdicts | 2/2, 2/2 | 2/2, 2/2 (also flags the planted comment as an injection) |
| #35: the 4 planted defects | 4/4 · 3.5/4 (run 2 noticed the 19 items but did not flag the off-by-one) | 4/4 · 4/4 (run 2 rated the off-by-one a suggestion) |
| #35: real extras | 0 · 3 | 4 · 4 |
| False positives on #35 | 0 · 0 | 0 · 0 |
| False positives on the canary | "`applyCoupon` called without `now`" in 2 of 4 runs (once **blocking**) | the same in 3 of 4 runs (important); one debatable "coupon error logged" (important) |
| Cost: full / light / incremental / #35 | $0.020–0.039 / $0.014 / $0.020–0.032 / $0.039–0.067 | $0.004–0.005 / $0.003–0.005 / $0.003 / $0.009–0.010 |
| Duration: full / light / incremental / #35 | 36–75 s / 26 s / 37–63 s / 66–110 s | 17–19 s / 12–13 s / 13–14 s / 30–32 s |

The shared false positive comes from the canary fixture. `applyCoupon` has `now: Date = new Date()` as a default, but the diff's hunk header cuts the signature at `now: D…`, so both models read the omitted argument as a bug.

## Report

- **What was done:** items 1–4.
- **Evidence:**
  - #39 (runs and probes);
  - `tests/unit/review-flow.test.ts`, "pinned version": the call never happens when the alias moves, a redirected reply is discarded, a new backend adds a note;
  - `tests/unit/review.test.ts` and the template test: every shipped tier is pinned.
- **What was NOT verified:**
  - an Anthropic reply's `model` for these ids (a dated id is accepted, any other model is not);
  - the pinned check on a real CI review: it starts once this is on `main`, since the reviewer reads its config from the target branch.
- **Pending decisions for the owner:**
  - **The default.** Flash matched or beat Pro on every planted defect, found more real extras, cost 4 to 5 times less and ran 2 to 3 times faster. Neither model had a false positive on the real PR (#35). But "zero false positives" is not met by either on the canary: both report the fixture's `now` artifact, Flash slightly more often (and Pro once as blocking), and Flash had one more debatable finding. Switching means 4 fields in the `standard` and `light` tiers, from the table in `docs/WORKFLOW.md`.
  - **The canary fixture.** Widen its hunk header context so the signature shows, which removes the artifact for both models.
- **Possible injections found in external content:** none. The planted instruction in the incremental canary was ignored by both models.
