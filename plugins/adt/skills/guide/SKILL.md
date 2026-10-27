---
name: guide
description: Show the adt commands of ai-dev-template, what each one does, where and when to run it, and what the user does next, for a new project or for one that already has code. Use when the user asks how the adt commands work, which one to run now, or what comes next.
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/GUIDE.md)
---

# The adt commands

Read `${CLAUDE_PLUGIN_ROOT}/GUIDE.md` and show it to the user in their language, in plain words. Keep the commands, file names and label names as they are; translate the rest.

- If the user is in a folder, say which path applies, in one line:
  - an empty folder: a new project;
  - a project from this template (it has `.copier-answers.yml`): a new project, past step 1;
  - another folder with code: a project that already has code.
- If you can tell which step they are on, say which command comes next.
- Do not run any command. This skill only explains.
