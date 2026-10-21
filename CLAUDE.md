# CLAUDE.md

As regras deste projeto estão no `AGENTS.md`, que vale para qualquer agente. O Claude Code importa o arquivo abaixo:

@AGENTS.md

## Notas específicas do Claude Code

- `.claude/settings.json` bloqueia edição em `tests/invariants/`. Se o bloqueio aparecer, ele é intencional: **pare e pergunte ao dono** (AGENTS.md, seção 1.2). Não tente contornar com Bash ou scripts.
- Revisão de segurança depois de mudanças em autenticação, dados de usuário, pagamentos ou entrada externa: `/security-review`.
