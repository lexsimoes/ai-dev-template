// The adt guide (plugins/adt/GUIDE.md): every command of the plugin is in it, and the user meets it where they start.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const GUIDE = readFileSync("plugins/adt/GUIDE.md", "utf-8");
const skills = readdirSync("plugins/adt/skills").filter((name) => existsSync(join("plugins/adt/skills", name, "SKILL.md")));

test("the guide names every adt command, with where and when to run it", () => {
  assert.ok(skills.length >= 6);
  for (const name of skills) assert.match(GUIDE, new RegExp(`\`/adt:${name}( <path>)?\``), `/adt:${name} is in the guide`);
  assert.match(GUIDE, /\| Step \| Command \| Where \| When \| What it does \| Then you \|/);
  assert.match(GUIDE, /`\/explore <area>`/);
  assert.ok(existsSync(".claude/skills/explore/SKILL.md"), "the project command the guide names exists");
  for (const label of ["invariant-approved", "eval-approved", "test-approved", "deep-review", "re-review"]) assert.match(GUIDE, new RegExp(`\`${label}\``), label);
  assert.match(GUIDE, /never in the chat/, "keys stay out of the conversation");
});

test("the user meets the guide where they start: /adt:guide, the first step of /adt:new-project, the project README", () => {
  const guideSkill = readFileSync("plugins/adt/skills/guide/SKILL.md", "utf-8");
  assert.match(guideSkill, /\$\{CLAUDE_PLUGIN_ROOT\}\/GUIDE\.md/);
  assert.match(guideSkill, /Do not run any command/);
  const newProject = readFileSync("plugins/adt/skills/new-project/SKILL.md", "utf-8");
  // The body (after the frontmatter) shows the guide in a step 0, before step 1.
  const body = newProject.replace(/^---\n[\s\S]*?\n---\n/, "");
  const step0 = /## 0\. The path, before anything else\n([\s\S]*?)\n## 1\. What is in this folder/.exec(body)?.[1] ?? "";
  assert.match(step0, /\$\{CLAUDE_PLUGIN_ROOT\}\/GUIDE\.md/, "new-project shows the path before anything else");
  assert.match(newProject, /^allowed-tools: Read\(\$\{CLAUDE_PLUGIN_ROOT\}\/GUIDE\.md\)/m);
  assert.match(readFileSync("README.md.jinja", "utf-8"), /`\/adt:guide`/);
  assert.match(readFileSync("README.md", "utf-8"), /`\/adt:guide`/);
});
