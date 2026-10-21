# CLAUDE.md

This project's rules are in `AGENTS.md`, which applies to any agent. Claude Code imports the file below:

@AGENTS.md

## Claude Code specific notes

- `.claude/settings.json` blocks edits in `tests/invariants/`. If the block shows up, it is intentional: **stop and ask the owner** (AGENTS.md, section 1.2). Do not try to get around it with Bash or scripts.
- Security review after changes to authentication, user data, payments or external input: `/security-review`.
