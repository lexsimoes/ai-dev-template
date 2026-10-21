// Release notes for one version, taken from CHANGELOG.md, after checking the changelog is ready for that release.
// Use: node scripts/release/notes.ts 0.1.0   (prints the notes; exits 1 with the problems if it is not ready)
// The owner runs it inside `gh release create` (docs/RELEASING.md); agents never create releases.

import { readFileSync } from "node:fs";
import { releaseNotes, releaseProblems } from "./lib.ts";

const version = (process.argv[2] ?? "").replace(/^v/, "");
const changelog = readFileSync("CHANGELOG.md", "utf-8");
const problems = releaseProblems(changelog, version);
if (problems.length) {
  console.error(`Not ready to release ${version || "(no version given)"}:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(releaseNotes(changelog, version));
