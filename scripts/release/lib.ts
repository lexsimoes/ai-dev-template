// Pure parts of the release flow (docs/RELEASING.md): reading CHANGELOG.md. Tested in tests/unit/release.test.ts.

export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Released versions in CHANGELOG.md, newest first (headings `## [X.Y.Z] - YYYY-MM-DD`). */
export function releasedVersions(changelog: string): Array<{ version: string; date: string }> {
  return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)].map((m) => ({ version: m[1] ?? "", date: m[2] ?? "" }));
}

/** Body of a version's section (without its heading), trimmed; null if the version has no section. */
export function releaseNotes(changelog: string, version: string): string | null {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}] - `));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && (/^## /.test(l) || /^\[[^\]]+\]: /.test(l)));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

/** What is wrong with releasing `version` now; empty list = ready. */
export function releaseProblems(changelog: string, version: string): string[] {
  if (!VERSION_RE.test(version)) return [`"${version}" is not a version like 0.1.0 (no "v" here; the tag adds it)`];
  const released = releasedVersions(changelog);
  const problems: string[] = [];
  if (!released.some((r) => r.version === version)) problems.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
  else if (released[0]?.version !== version) problems.push(`${version} is not the newest version in CHANGELOG.md (newest: ${released[0]?.version})`);
  if (releaseNotes(changelog, version) === "") problems.push(`the ${version} section in CHANGELOG.md is empty`);
  if (!changelog.includes(`[${version}]: https://`)) problems.push(`CHANGELOG.md has no link line for [${version}] at the end`);
  return problems;
}
