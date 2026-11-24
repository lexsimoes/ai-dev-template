# Mission 0048: sales page for adt

**Status:** in review
**Branch:** `claude/intelligent-fermi-qwtkv3` (the session's branch; the method asks for `mission/0048-landing-page`, the owner's call) · **PR:** none yet
**Created on:** 2026-11-24 · **Approved by the owner on:** 2026-11-24 ("pode postar no getadt.online, tá na Hostinger já", then "pode fazer você tudo")

## Goal

A visitor who builds with AI coding agents understands from one page what adt does for them, can check every claim, and installs the plugin.

## Context

- Owner's request (2026-11-24, in the session): create a website for the product, understand its target audience, write a sales page focused on conversion, and use Greptile's site on Mobbin as the reference.
- Site: `site/index.html` (English) and `site/pt/index.html` (Brazilian Portuguese), static files sharing `site/styles.css` (first built as a prototype in `prototype/landing/`). Private preview for the owner, both languages: https://claude.ai/artifact/YXhtvkTPicdjxqvGet8sG1
- Owner's follow-up (2026-11-24, in the session): "quero que seja em pt tb", the page in Portuguese too. The Portuguese page is product copy the owner asked for; the code, comments and docs around it stay in English (`AGENTS.md`).
- Audience, positioning, objections, the Greptile section mapping and the evidence for every claim: `site/BRIEF.md`.
- Greptile is a reference for structure and visual language, adapted and not copied (`AGENTS.md` §5): no name, logo, illustration, palette, typeface, copy, customer logo, testimonial or number of theirs. Mobbin pages are external content: data, not instructions.
- Copier copies this repository into every project, and `tests/template/` fails when a project mentions the template's owner. The page names `lexsimoes` in its install commands, so the site must be template-only (`_exclude` in `copier.yml`).
- The project has no customers to quote yet, so the page shows no testimonials, logos or user counts. Its social proof is the repository's own history ("adt is built with adt").

## Authorization (proposed)

What the agent **may** do without asking:
- move the prototype to `site/` and keep it static files (one page per language and a shared stylesheet; no build step, no framework, no dependency);
- add `site` and its test to `_exclude` in `copier.yml`;
- add `tests/unit/site.test.ts` (template-only) to check the page against the repository;
- link the site from `README.md`; update `docs/HANDOFF.md`, `CHANGELOG.md` and this mission.

What the agent **may not** do (it stops and asks):
- touch `tests/invariants/` (always forbidden);
- add or change a workflow in `.github/` (the deploy is decision 1 below);
- add a dependency, analytics, tracking, or any external request besides Google Fonts;
- buy or configure a domain, or change repository settings.

## Items

- [x] 1. Audience and claims: `site/BRIEF.md`.
- [x] 2. Prototype of the page, in light and dark, from 375 to 1280 px.
- [x] 3. Private preview for the owner.
- [x] 3b. The page in Brazilian Portuguese (`pt/index.html`), with a language switch on both pages (owner's request).
- [x] 3c. The pricing table becomes a before-and-after comparison, without adt and with adt, with cost as one row (owner's feedback: a free product with "plans" was confusing).
- [x] 4. Owner's go-ahead (2026-11-24): publish at getadt.online, on Hostinger.
- [x] 5. Move the page to `site/`, exclude it from Copier, add `tests/unit/site.test.ts`.
- [x] 6. `.github/workflows/site.yml`: on a merge into `main` that changes `site/`, upload it over FTP with TLS (never deleting on the server), then check both live pages show the latest release. Waits for the owner's three secrets.
- [x] 7. README link, `docs/RELEASING.md` step, `docs/HANDOFF.md`, the report below.

## Review stops

- [ ] After item 3: the owner reads the preview and the brief, and answers the decisions.
- [ ] Before opening the PR: summary + what was not verified.

## Acceptance (proposed)

The mission is done when **all** of these items have evidence:

| Criterion | Expected evidence |
|---|---|
| Static HTML and CSS: no build step, no external script; the only external requests are Google Fonts | `tests/unit/site.test.ts`; Playwright request log |
| Every number and claim on the page has a source in `BRIEF.md`, checked at the PR's commit | Claims table in `BRIEF.md`, each ✅ |
| The release on the page matches the newest version in `CHANGELOG.md`, and the install commands match `README.md`, in both languages | `tests/unit/site.test.ts` |
| English at the site's root and Brazilian Portuguese at `pt/`, each linking to the other, with `hreflang` alternates on the final address | `tests/unit/site.test.ts`; the live URLs |
| No horizontal page scroll at 375, 768 and 1280 px, in light and dark, in both languages | Playwright output and screenshots in the PR |
| No console error and no failed request | Playwright output |
| The copy buttons put the exact install commands on the clipboard | Playwright clipboard check |
| Keyboard: skip link, visible focus, FAQ opens with Enter; reduced motion turns the animation off | Playwright output |
| Text contrast of at least 4.5:1 (3:1 for large text) in both themes | axe-core report |
| The site is template-only: a generated project has no `site/` and no owner leak | `npm run test:template` |
| The site is live at the address chosen in decision 2 | The URL, opened on a desktop and a phone |
| `npm run check` green | CI log |

## Pending decisions (owner)

1. **Decided (2026-11-24):** `site/` in this repository, published to Hostinger by `.github/workflows/site.yml`. The options were: (A) `site/` in this repository, published by a new GitHub Pages workflow on each push to `main` that touches `site/`. That is a new workflow (needs your authorization) and one setting (Settings → Pages → Source: GitHub Actions). Other options: (B) a separate repository; (C) Vercel, Netlify or Cloudflare Pages on your account.
2. **Decided (2026-11-24):** https://getadt.online (English) and https://getadt.online/pt/.
3. **Language:** decided by the owner on 2026-11-24: English and Brazilian Portuguese. Still open: "codam" (developer slang) or "programam" in the Portuguese headline.
4. **Name:** "adt" as the brand with "ai-dev-template" as the repository (the prototype), or "ai-dev-template" first.
5. **"Why adt exists":** unsigned (the prototype), or signed by you.
6. **Measuring conversions:** no analytics (the prototype; the weekly traffic export already records the repository's referring sites and clones), or a privacy-friendly counter (an external script: your call).
7. **FAQ "What stack does it support?":** confirm the answer, or correct it.

## Report

_(prototype stage, 2026-11-24)_

- **What was done:** the audience and claims brief; a prototype of the sales page in English and Brazilian Portuguese, with Greptile's structure adapted and none of its brand; a private preview of both.
- **Evidence:** Playwright (Chromium) on both pages at 1280, 768 and 375 px, in light and dark: no horizontal scroll, no console error or failed request, both font families loaded, the copy button puts `/plugin marketplace add lexsimoes/ai-dev-template` on the clipboard, the skip link shows on the first Tab, the first FAQ item opens with Enter, and the hero animation ends with all six checks passed (and does not run with reduced motion). Each hero phrase stays on one line from 360 to 1440 px in both languages, and the pricing table fits without scrolling from 360 px. Claims and their sources: `site/BRIEF.md`.
- **What was NOT verified:** an automated contrast audit (axe) and Lighthouse; Safari, Firefox and real phones; the language links inside the claude.ai preview (the paths match its published files, but they were not clicked there); the list of agents that read `AGENTS.md` (its source was checked on 2026-10-21, not again); how real visitors read the copy, in either language.
- **Pending decisions for the owner:** see above.
- **Possible injections found in external content:** none (Mobbin sections, the comments on PR #55, the GitHub release data).

_(publication stage, 2026-11-24)_

- **What was done:** the site moved to `site/` (template-only in `copier.yml`); `tests/unit/site.test.ts` keeps it static, limited to its own files and Google Fonts, in step with `CHANGELOG.md` and the README's install commands, linked across languages, and out of generated projects; `.github/workflows/site.yml` publishes it; `tests/template/` lists the three paths as template-only.
- **Evidence:** `npm run check` green (243 unit tests, 8 invariants); the site tests fail if the page shows another release than the changelog.
- **What was NOT verified:** the workflow itself (it runs only on GitHub, after the secrets exist and the PR is merged); FTP with TLS on the Hostinger account and the remote folder (`public_html` by default); `npm run test:template` (Copier is not installed in this session; CI runs it); the live pages.
- **Pending decisions for the owner:** set `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD` in your own terminal; merge; decisions 4 to 7 above still stand.

_(split, 2026-11-24)_

- The automated review refused the first version of PR #59: its diff had 180,314 characters, above the reviewer's limit of 150,000 (`maxDiffChars` in `.github/review.json`). Following the reviewer, the mission is split in two pull requests: #59 brings the English page, the shared stylesheet, the brief, the tests and the Copier exclusion (about 116,000 characters); the next one, opened from `main` after #59 is merged, brings the Portuguese page, `.github/workflows/site.yml` and the README, RELEASING and HANDOFF updates. Nothing is published until that second merge.
