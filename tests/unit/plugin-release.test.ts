// The Claude Code plugin (plugins/ai-dev, template-only) stays consistent with the release flow and works when installed:
// Claude Code copies only the plugin folder into its cache, so nothing in it may reach outside that folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { releasedVersions } from "../../scripts/release/lib.ts";
import { LABELS } from "../../plugins/ai-dev/scripts/lib/project.ts";

const PLUGIN = resolve("plugins/ai-dev");
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf-8")) as T;

test("the plugin creates projects from the newest release, and its version follows it", () => {
  const newest = releasedVersions(readFileSync("CHANGELOG.md", "utf-8"))[0]?.version;
  const template = readJson<{ repository: string; release: string }>(join(PLUGIN, "template.json"));
  const manifest = readJson<{ name: string; version: string }>(join(PLUGIN, ".claude-plugin/plugin.json"));
  assert.equal(template.release, `v${newest}`, "template.json release = newest version in CHANGELOG.md (changed only in a release PR)");
  assert.equal(manifest.version, newest, "plugin.json version = newest version in CHANGELOG.md");
  assert.match(readFileSync("CHANGELOG.md", "utf-8"), new RegExp(`github\\.com/${template.repository}/`), "same repository as the changelog links");
});

test("the marketplace lists the plugin from its folder in this repository", () => {
  const market = readJson<{ name: string; plugins: Array<{ name: string; source: string }> }>(".claude-plugin/marketplace.json");
  assert.equal(market.name, "ai-dev-template");
  for (const p of market.plugins) {
    assert.match(p.source, /^\.\//, "relative source, resolved from the marketplace root");
    const manifest = readJson<{ name: string }>(join(p.source, ".claude-plugin/plugin.json"));
    assert.equal(manifest.name, p.name);
  }
});

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" }).map((f) => join(dir, f));
}

test("installed copy is self-contained: scripts import only Node built-ins and files inside the plugin", () => {
  for (const file of files(PLUGIN).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(file, "utf-8");
    for (const [, spec] of source.matchAll(/^\s*import\s[^'"]*["']([^"']+)["']/gm)) {
      if (spec?.startsWith("node:")) continue;
      assert.ok(spec?.startsWith("."), `${relative(PLUGIN, file)} imports a package (${spec}): the installed plugin has no node_modules`);
      const target = resolve(dirname(file), spec ?? "");
      assert.ok(target.startsWith(PLUGIN + "/"), `${relative(PLUGIN, file)} imports ${spec}, outside the plugin folder`);
      assert.ok(existsSync(target), `${relative(PLUGIN, file)} imports ${spec}, which does not exist`);
    }
  }
});

test("skills: frontmatter, and every script they run exists in the plugin", () => {
  const skills = files(join(PLUGIN, "skills")).filter((f) => f.endsWith("SKILL.md"));
  assert.ok(skills.length > 0);
  for (const skill of skills) {
    const text = readFileSync(skill, "utf-8");
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    assert.match(front, /^name: [a-z][a-z0-9-]*$/m, `${relative(PLUGIN, skill)}: name`);
    assert.match(front, /^description: .{40,}$/m, `${relative(PLUGIN, skill)}: a description Claude can match`);
    for (const [, script] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+\.ts)/g)) {
      assert.ok(existsSync(join(PLUGIN, script ?? "")), `${relative(PLUGIN, skill)} runs ${script}, which does not exist`);
    }
  }
});

test("README labels are the ones the plugin checks and creates", () => {
  const readme = readFileSync("README.md", "utf-8");
  const commands = [...readme.matchAll(/^gh label create (\S+) --color (\w+) --description "([^"]+)"$/gm)].map((m) => ({ name: m[1], color: m[2], description: m[3] }));
  assert.deepEqual(commands, LABELS);
});
