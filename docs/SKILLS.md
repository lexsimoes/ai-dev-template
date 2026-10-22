# Skills: source, installation and verification

A **skill** is a package of instructions the agent loads only when the task calls for it (like a manual that stays on the shelf until it is needed).
`AGENTS.md` says **which** one to use; this file says **where it comes from** and **how to install it**.

**Names checked on 2026-10-21** in the public catalogs and in the skill list of a Claude Code session with the owner's plugins. Installation on **your** machine must be checked with the commands at the end of the page.

## Claude Code

| Skill | Source | How to install | Status |
|---|---|---|---|
| `vectorlab-ux-skills:page-patterns`, `:ux-audit`, `:errors` (and others in the package) | Plugin `vectorlab-ux-skills` | Already enabled on the owner's account | ✅ seen in the session |
| `design:accessibility-review`, `design:ux-copy`, `design:design-critique` | Plugin `design` | Already enabled on the owner's account | ✅ seen in the session |
| `/security-review`, `/code-review` | Built into Claude Code | none | ✅ seen in the session |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `npx skills add anthropics/skills --skill frontend-design -a claude-code` | ⬜ not installed in the session |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `npx skills add vercel-labs/agent-skills --skill react-best-practices -a claude-code` | ⬜ not installed in the session |
| Context7 | [upstash/context7](https://github.com/upstash/context7) (MCP: `resolve-library-id`, `query-docs`) | `npx ctx7 setup --claude` | ⬜ not installed in the session |

### Suggested by `/adt:discover`

`/adt:discover` (Claude Code plugin `adt`) suggests only these, from the answers about the product. The list is fixed (`plugins/adt/catalog.json` in the template repository). It shows the install command and never installs anything itself.

| Need in the answers | Suggestion |
|---|---|
| External libraries or frameworks | Context7 |
| Screens | `frontend-design` |
| React or Next.js | `react-best-practices` |
| Login, payments, personal data, external input | `/security-review` |

## Codex

Codex loads skills from `.agents/skills/` (in the repository) and from `~/.agents/skills/` (the user's). Call a skill with `$name` or through the `/skills` menu.

| Skill | Source | How to install |
|---|---|---|
| `frontend-app-builder`, `react-best-practices` | Plugin `build-web-apps` ([openai/plugins](https://github.com/openai/plugins)) | Through the Codex plugin directory |
| `audit`, `design-qa` | Plugin `product-design` (openai/plugins) | Through the Codex plugin directory |
| `nextjs` | Plugin `vercel` (openai/plugins) | Through the Codex plugin directory |
| `security-diff-scan` | Plugin `codex-security` (openai/plugins) | Through the Codex plugin directory |
| `security-best-practices` | Catalog [openai/skills](https://github.com/openai/skills) (`.curated`) | `$skill-installer security-best-practices` |
| `web-design-guidelines` | vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a codex` |
| Context7 | upstash/context7 (MCP) | MCP server `https://mcp.context7.com/mcp` in `~/.codex/config.toml` |

Note: the `openai/skills` repository is marked as deprecated and points to `openai/plugins`. Plugin skills depend on the plugin being installed.

## How to check what is installed

```bash
# Claude Code: inside a session, type /  (lists commands and skills)
ls ~/.claude/skills .claude/skills 2>/dev/null
# Codex: inside a session, type /skills
ls ~/.agents/skills .agents/skills 2>/dev/null
```
