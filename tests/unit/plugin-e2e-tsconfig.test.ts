// Template-only counterparts of e2e-tsconfig.test.ts: Copier excludes adopt/ and renders .jinja files.
// This file is excluded from generated projects by the existing tests/unit/plugin-*.test.ts pattern.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the adoption kit and package template pin Playwright to a tsconfig that redirects nothing", () => {
  const lines = readFileSync("adopt/files/adt-e2e.yml", "utf-8").split("\n").filter((l) => /playwright test\b/.test(l) && !/^\s*#/.test(l));
  for (const line of lines) assert.match(line, /--tsconfig=e2e\/tsconfig\.json/, line);
  assert.equal(lines.length, 2);
  assert.match(readFileSync("package.json.jinja", "utf-8"), /"e2e": "playwright test --tsconfig=e2e\/tsconfig\.json"/, "package.json.jinja");
  const path = "adopt/files/e2e/tsconfig.json";
  const config = JSON.parse(readFileSync(path, "utf-8")) as { extends?: unknown; compilerOptions: Record<string, unknown> };
  assert.equal(config.extends, undefined, `${path} never extends another tsconfig`);
  assert.ok(!("paths" in config.compilerOptions) && !("baseUrl" in config.compilerOptions) && !("rootDirs" in config.compilerOptions), path);
});
