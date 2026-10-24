// End-to-end tests run under the protected e2e/tsconfig.json only. Playwright otherwise looks up the nearest
// tsconfig.json for each file, the config included, and a root tsconfig.json with `paths` could redirect
// @playwright/test (a fake `expect`, or a `defineConfig` that leaves every test out) without touching e2e/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const json = (path: string) => JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
/** The lines that run Playwright's tests (comments left out). */
const runs = (path: string) => readFileSync(path, "utf-8").split("\n").filter((l) => /playwright test\b/.test(l) && !/^\s*#/.test(l));

test("every Playwright run in CI and npm passes --tsconfig=e2e/tsconfig.json, which redirects nothing", () => {
  for (const line of [...runs(".github/workflows/ci.yml"), ...runs("adopt/files/adt-e2e.yml")]) assert.match(line, /--tsconfig=e2e\/tsconfig\.json/, line);
  assert.equal(runs(".github/workflows/ci.yml").length, 2);
  assert.equal(runs("adopt/files/adt-e2e.yml").length, 2);
  for (const path of ["package.json", "package.json.jinja"]) assert.match(readFileSync(path, "utf-8"), /"e2e": "playwright test --tsconfig=e2e\/tsconfig\.json"/, path);
  assert.match(readFileSync("playwright.config.ts", "utf-8"), /tsconfig: "\.\/e2e\/tsconfig\.json",/);
  for (const path of ["e2e/tsconfig.json", "adopt/files/e2e/tsconfig.json"]) {
    const config = json(path) as { extends?: unknown; compilerOptions: Record<string, unknown> };
    assert.equal(config.extends, undefined, `${path} never extends another tsconfig`);
    assert.ok(!("paths" in config.compilerOptions) && !("baseUrl" in config.compilerOptions) && !("rootDirs" in config.compilerOptions), path);
  }
});

test("e2e/tsconfig.json keeps the root's compiler options, so Playwright and npm run check agree", () => {
  const root = (json("tsconfig.json") as { compilerOptions: Record<string, unknown> }).compilerOptions;
  const e2e = (json("e2e/tsconfig.json") as { compilerOptions: Record<string, unknown> }).compilerOptions;
  assert.deepEqual(e2e, root);
});
