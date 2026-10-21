# Skills: origem, instalação e verificação

Uma **skill** é um pacote de instruções que o agente carrega só quando a tarefa pede (como um manual que fica na estante até ser preciso).
O `AGENTS.md` diz **qual** usar; este arquivo diz **de onde vem** e **como instalar**.

**Nomes conferidos em 2026-10-21** nos catálogos públicos e na lista de skills de uma sessão do Claude Code com os plugins do dono. A instalação na **sua** máquina precisa ser conferida com os comandos do fim da página.

## Claude Code

| Skill | Origem | Como instalar | Status |
|---|---|---|---|
| `vectorlab-ux-skills:page-patterns`, `:ux-audit`, `:errors` (e outras do pacote) | Plugin `vectorlab-ux-skills` | Já habilitado na conta do dono | ✅ vista na sessão |
| `design:accessibility-review`, `design:ux-copy`, `design:design-critique` | Plugin `design` | Já habilitado na conta do dono | ✅ vista na sessão |
| `/security-review`, `/code-review` | Embutidas no Claude Code | nenhuma | ✅ vista na sessão |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `npx skills add anthropics/skills --skill frontend-design -a claude-code` | ⬜ não instalada na sessão |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `npx skills add vercel-labs/agent-skills --skill react-best-practices -a claude-code` | ⬜ não instalada na sessão |
| Context7 | [upstash/context7](https://github.com/upstash/context7) (MCP: `resolve-library-id`, `query-docs`) | `npx ctx7 setup --claude` | ⬜ não instalado na sessão |

## Codex

O Codex carrega skills de `.agents/skills/` (no repositório) e de `~/.agents/skills/` (do usuário). Chame uma skill com `$nome` ou pelo menu `/skills`.

| Skill | Origem | Como instalar |
|---|---|---|
| `frontend-app-builder`, `react-best-practices` | Plugin `build-web-apps` ([openai/plugins](https://github.com/openai/plugins)) | Pelo diretório de plugins do Codex |
| `audit`, `design-qa` | Plugin `product-design` (openai/plugins) | Pelo diretório de plugins do Codex |
| `nextjs` | Plugin `vercel` (openai/plugins) | Pelo diretório de plugins do Codex |
| `security-diff-scan` | Plugin `codex-security` (openai/plugins) | Pelo diretório de plugins do Codex |
| `security-best-practices` | Catálogo [openai/skills](https://github.com/openai/skills) (`.curated`) | `$skill-installer security-best-practices` |
| `web-design-guidelines` | vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a codex` |
| Context7 | upstash/context7 (MCP) | Servidor MCP `https://mcp.context7.com/mcp` em `~/.codex/config.toml` |

Observação: o repositório `openai/skills` está marcado como descontinuado e aponta para `openai/plugins`. As skills de plugin dependem do plugin estar instalado.

## Como conferir o que está instalado

```bash
# Claude Code: dentro de uma sessão, digite /  (lista comandos e skills)
ls ~/.claude/skills .claude/skills 2>/dev/null
# Codex: dentro de uma sessão, digite /skills
ls ~/.agents/skills .agents/skills 2>/dev/null
```
