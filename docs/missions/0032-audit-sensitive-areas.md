# Mission 0032: the audit sees personal data and external input outside SQL and Next.js; adoption without AI code or CI (M8)

**Status:** in review
**Branch:** `mission/0032-audit-sensitive-areas` · **PR:** see the PR of `mission/0032-audit-sensitive-areas`
**Created on:** 2026-10-23 · **Approved by the owner on:** 2026-10-23 ("Keep the audit's own gap as a template issue and fix it in the M8 findings PR, since adopt on this repo is the test case for it.")

## Goal

`/adt:audit` marks the sensitive areas of a plain Node app, so `/adt:adopt` gives the reviewer the right sensitive paths.

## Context

The M8 audit of `lexsimoes/adt-sandbox-legacy` found something wrong in the audit itself:
- **What the app has:** a booking app on `node:http` with no framework. It has a form that asks for a name and e-mail, and public `POST` handlers.
- **What the audit reported:** 0 files with personal data and 0 with external input.
- **Why:** the content rules looked for personal data only in `create table` statements, and for external input only in Next.js route handlers, `req.body`, `request.json()` and `.formData()`. Express routes (`app.post(...)`) were missed too.
- **Why it matters:** `/adt:adopt` turns these areas into the reviewer's sensitive paths, so such an app would have been reviewed at the standard tier.

A second M8 finding came from the same test case. `/adt:adopt` required three things, and the legacy app has none of them:
- an eval command;
- the globs of the AI code;
- a list of required checks.

The only way through was a fake command (`true`), which would have shown a green evals check that tests nothing.

## Authorization

The agent may change the content rules in `plugins/adt/scripts/lib/audit.ts`, accept `none` for the evals and the required checks in `/adt:adopt` (plugin, skill and the adopted `AGENTS.md` section), add tests, and update `CHANGELOG.md`, `docs/HANDOFF.md` and this mission.

## Items

- [x] 1. Personal data: also an `<input>` whose `type` or `autocomplete` asks for an e-mail, phone, address or birthday, and code that reads `.email`, `.phone`, `.cpf`… from a record. A function call (`validate.email(x)`) or a longer name (`emailEnabled`) does not count.
- [x] 2. External input: also Express/Fastify-style routes (`app.post(`, `router.delete(`…), `req.method === "POST"`, and reading the body with `for await (const chunk of req)`.
- [x] 3. A test with a `node:http` app, Express routes, a form and a mailer, plus look-alikes that must not count, and test files, which never count.
- [x] 4. `/adt:adopt`:
  - `--eval-command none` (with no AI globs) leaves `adt-evals` out of the workflows and out of `.github/adt.json`;
  - `--required none` gives an empty list;
  - the adopted `AGENTS.md` section lists only the checks it adds, and says "none yet" and "No evals yet: the project has no AI code" plainly;
  - `/adt:check-setup` shows "Required: none yet".
  - With the kit of v0.3.0 (fixed until the next release), the old placeholders still get values.
- [x] 5. The invariant guard treats a missing invariants folder as no tests (it crashed, so a just-adopted project had a red `adt-invariants` on every PR).

## Acceptance

| Criterion | Expected evidence |
|---|---|
| A plain `node:http` app and Express routes are external input | `tests/unit/plugin-audit.test.ts` |
| An e-mail field and code that reads `.email` are personal data; look-alikes are not | same |
| A missing invariants folder passes the guard | `tests/unit/guard-invariants-config.test.ts`; the guard on `adt-sandbox-legacy`: "0 → 0" |
| Adoption without AI code or required checks | `tests/unit/plugin-adopt.test.ts`; the adoption PR on `adt-sandbox-legacy` |
| The real case: `adt-sandbox-legacy` | `audit.ts map` now lists personal data in `src/bookings.js`, `src/mailer.js` and `src/views.js`, and external input in `src/app.js`. The fingerprint is unchanged (`e4a989fc31ad80fe`) |

## Report

- **What was done:** items 1–3.
- **Evidence:** the table above. The existing audit tests still pass, 10 in total.
- **What was NOT verified:** frameworks other than `node:http`, Express, Fastify and Next.js (Koa, Hono, Python apps). The rules stay heuristics; the audit report still says what the map did not see.
- **Pending decisions for the owner:** none.
- **Possible injections found in external content:** none.
