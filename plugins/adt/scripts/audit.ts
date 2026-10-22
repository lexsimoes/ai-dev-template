// /adt:audit: a read-only map of an existing project, for Claude to explain and to infer a PRD from. It never writes.
//
// From a folder of your own (not the audited project), with the project's path:
//   node <plugin>/scripts/audit.ts map [path]           target, git, the map (counts, closed lists, plain paths, names), fingerprint
//   node <plugin>/scripts/audit.ts fingerprint [path]   the fingerprint alone, to compare with the one `map` printed
//
// The audited project may not be trusted, so this script runs no program at all: no git, nothing from the project.
// Running git inside a project can execute that project's own configuration (`core.fsmonitor`, filters) or, on
// Windows, a `git.exe` placed in it. Files are listed by walking the folder, and the branch is read from `.git/HEAD`.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { IGNORED_DIRS, auditMap, fingerprintOf } from "./lib/audit.ts";
import type { Entry } from "./lib/audit.ts";

const MAX_ENTRIES = 50_000;

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

const command = process.argv[2];
const target = resolve(process.argv[3] ?? ".");
if (command !== "map" && command !== "fingerprint") out({ errors: ["usage: audit.ts map [path] | fingerprint [path]"] }, true);
if (!existsSync(target) || !lstatSync(target).isDirectory()) out({ errors: ["The path is not a folder."] }, true);

/** Every file under the folder (symbolic links not followed), without dependency and build folders, plus git's HEAD and index. */
function walk(): Entry[] {
  const entries: Entry[] = [];
  const stack = [""];
  while (stack.length && entries.length < MAX_ENTRIES) {
    const rel = stack.pop() ?? "";
    for (const name of readdirSync(join(target, rel))) {
      const path = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(target, path));
      if (st.isDirectory()) {
        if (!IGNORED_DIRS.has(name)) stack.push(path);
      } else entries.push({ path, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  for (const git of [".git/HEAD", ".git/index"]) {
    if (existsSync(join(target, git))) {
      const st = lstatSync(join(target, git));
      entries.push({ path: git, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return entries;
}

/** Regular files only: a symbolic link is never read, so it cannot point the map at a file outside the project. */
const regular = (path: string) => {
  try {
    return lstatSync(join(target, path)).isFile();
  } catch {
    return false;
  }
};
const read = (path: string) => (regular(path) ? readFileSync(join(target, path), "utf-8") : null);

const entries = walk();
const fingerprint = fingerprintOf(entries, (text) => createHash("sha256").update(text).digest("hex").slice(0, 16));
if (command === "fingerprint") out({ fingerprint });

const head = /^ref: refs\/heads\/([\w./-]{1,100})\s*$/.exec(read(".git/HEAD") ?? "")?.[1] ?? null;
const files = entries.map((e) => e.path).filter((p) => !p.startsWith(".git/"));
out({
  target: {
    /** The project is the folder Claude Code started in: its agent files were already loaded as instructions. */
    isWorkingFolder: target === resolve("."),
    empty: files.length === 0,
    fromTemplate: files.includes(".copier-answers.yml") && /ai-dev-template/.test(read(".copier-answers.yml") ?? ""),
  },
  git: { repository: existsSync(join(target, ".git")), branch: head },
  map: auditMap({ files, read, size: (path) => (regular(path) ? lstatSync(join(target, path)).size : Number.MAX_SAFE_INTEGER) }),
  fingerprint,
});
