// /adt:audit: a read-only map of an existing project, for Claude to explain and to infer a PRD from. It never writes.
//
// In the project folder:
//   node <plugin>/scripts/audit.ts map           folder, git, the map (counts, closed lists, plain paths, variable names), fingerprint
//   node <plugin>/scripts/audit.ts fingerprint   the fingerprint alone, to compare with the one `map` printed

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IGNORED_DIRS, auditMap, fingerprintOf } from "./lib/audit.ts";
import type { Entry } from "./lib/audit.ts";
import { inspectFolder } from "./lib/new-project.ts";
import type { Template } from "./lib/new-project.ts";
import { run } from "./lib/run.ts";

const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf-8")) as Template;
const dir = process.cwd();
const MAX_ENTRIES = 50_000;

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

/** Every file under the folder (symbolic links not followed), without dependency and build folders, plus git's HEAD and index. */
function walk(): Entry[] {
  const entries: Entry[] = [];
  const stack = [""];
  while (stack.length && entries.length < MAX_ENTRIES) {
    const rel = stack.pop() ?? "";
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(dir, path));
      if (st.isDirectory()) {
        if (!IGNORED_DIRS.has(name)) stack.push(path);
      } else entries.push({ path, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  for (const git of [".git/HEAD", ".git/index"]) {
    if (existsSync(join(dir, git))) {
      const st = lstatSync(join(dir, git));
      entries.push({ path: git, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return entries;
}

const fingerprint = () => fingerprintOf(walk(), (text) => createHash("sha256").update(text).digest("hex").slice(0, 16));

/** Regular files only: a symbolic link is never read, so it cannot point the map at a file outside the project. */
const regular = (path: string) => {
  try {
    return lstatSync(join(dir, path)).isFile();
  } catch {
    return false;
  }
};

const command = process.argv[2];
if (command === "fingerprint") out({ fingerprint: fingerprint() });

if (command === "map") {
  const before = fingerprint();
  const tracked = run("git", ["ls-files", "-z"]);
  const files = tracked.code === 0 ? tracked.stdout.split("\0").filter(Boolean) : walk().map((e) => e.path).filter((p) => !p.startsWith(".git/"));
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = run("git", ["--no-optional-locks", "status", "--porcelain"]);
  const map = auditMap({
    files,
    read: (path) => (regular(path) ? readFileSync(join(dir, path), "utf-8") : null),
    size: (path) => (regular(path) ? lstatSync(join(dir, path)).size : Number.MAX_SAFE_INTEGER),
  });
  out({
    folder: inspectFolder(readdirSync(dir), (p) => (regular(p) ? readFileSync(join(dir, p), "utf-8") : null), template).kind,
    git: {
      repository: tracked.code === 0,
      branch: branch.code === 0 && /^[\w./-]{1,100}$/.test(branch.stdout.trim()) ? branch.stdout.trim() : null,
      clean: status.code === 0 ? status.stdout.trim() === "" : null,
    },
    map,
    fingerprint: before,
  });
}

out({ errors: ["usage: audit.ts map | fingerprint"] }, true);
