// Release flow (template-only): CHANGELOG.md sections and the notes script used by `gh release create`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { releaseNotes, releaseProblems, releasedVersions } from "../../scripts/release/lib.ts";

const CHANGELOG = `# Changelog

## [Unreleased]

### Fixed
- not released yet

## [0.2.0] - 2026-11-02

### Added
- plugin

## [0.1.0] - 2026-10-21

### Added
- first

[Unreleased]: https://x/compare/v0.2.0...HEAD
[0.2.0]: https://x/releases/tag/v0.2.0
[0.1.0]: https://x/releases/tag/v0.1.0
`;

test("changelog: released versions newest first, and the notes of one version only", () => {
  assert.deepEqual(releasedVersions(CHANGELOG), [
    { version: "0.2.0", date: "2026-11-02" },
    { version: "0.1.0", date: "2026-10-21" },
  ]);
  assert.equal(releaseNotes(CHANGELOG, "0.2.0"), "### Added\n- plugin");
  assert.equal(releaseNotes(CHANGELOG, "0.1.0"), "### Added\n- first", "stops at the link lines");
  assert.equal(releaseNotes(CHANGELOG, "9.9.9"), null);
});

test("release check: only the newest, documented version is ready", () => {
  assert.deepEqual(releaseProblems(CHANGELOG, "0.2.0"), []);
  assert.match(releaseProblems(CHANGELOG, "0.1.0").join(), /not the newest/);
  assert.match(releaseProblems(CHANGELOG, "0.3.0").join(), /no "## \[0\.3\.0\]/, "Unreleased must become a version section first");
  assert.match(releaseProblems(CHANGELOG, "v0.2.0").join(), /not a version/);
  assert.match(releaseProblems(CHANGELOG.replace("[0.2.0]: https://x/releases/tag/v0.2.0\n", ""), "0.2.0").join(), /no link line/);
  assert.match(releaseProblems(CHANGELOG.replace("### Added\n- plugin\n", ""), "0.2.0").join(), /empty/);
});

test("this repository's CHANGELOG.md is ready for its newest version", () => {
  const changelog = readFileSync("CHANGELOG.md", "utf-8");
  const newest = releasedVersions(changelog)[0];
  assert.ok(newest, "at least one released version");
  assert.deepEqual(releaseProblems(changelog, newest.version), []);
});

test("notes script: prints the notes, or fails with the reason (accepts a leading v)", async () => {
  const run = promisify(execFile);
  const changelog = readFileSync("CHANGELOG.md", "utf-8");
  const newest = releasedVersions(changelog)[0]!.version;
  const { stdout } = await run("node", ["scripts/release/notes.ts", `v${newest}`]);
  assert.equal(stdout.trim(), releaseNotes(changelog, newest));
  const bad = await run("node", ["scripts/release/notes.ts", "99.0.0"]).then(
    () => ({ code: 0, err: "" }),
    (e: { code?: number; stderr?: string }) => ({ code: e.code ?? 1, err: e.stderr ?? "" }),
  );
  assert.equal(bad.code, 1);
  assert.match(bad.err, /Not ready to release 99\.0\.0/);
});
