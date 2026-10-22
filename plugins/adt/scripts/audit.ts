// /adt:audit: a read-only map of an existing project, for Claude to explain and to infer a PRD from. It never writes.
//
// From a folder of your own (not the audited project), with the project's path:
//   node <plugin>/scripts/audit.ts map [path]           target, git, the map (counts, closed lists, plain paths, names), fingerprint
//   node <plugin>/scripts/audit.ts fingerprint [path]   the fingerprint alone, to compare with the one `map` printed
//
// The audited project may not be trusted, so this script runs no program at all: no git, nothing from the project.
// Running git inside a project can execute that project's own configuration (`core.fsmonitor`, filters) or, on
// Windows, a `git.exe` placed in it. Files are listed by walking the folder, and branches are read from git's own files.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { IGNORED_DIRS, auditMap, fingerprintOf, gitState } from "./lib/audit.ts";
import type { Entry, GitFiles } from "./lib/audit.ts";

/** Beyond this many files the map and the fingerprint are partial, and the output says so (`truncated`). */
const MAX_ENTRIES = Math.max(1, Number(process.env.ADT_AUDIT_MAX_ENTRIES) || 50_000);

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

const command = process.argv[2];
const target = resolve(process.argv[3] ?? ".");
if (command !== "map" && command !== "fingerprint") out({ errors: ["usage: audit.ts map [path] | fingerprint [path]"] }, true);
if (!existsSync(target) || !statSync(target).isDirectory()) out({ errors: ["The path is not a folder."] }, true);

let truncated = false;
let unreadable = 0;

/** Every file under the folder (symbolic links not followed), without dependency and build folders, plus git's HEAD and index. */
function walk(): Entry[] {
  const entries: Entry[] = [];
  const stack = [""];
  while (stack.length) {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const rel = stack.pop() ?? "";
    let names: string[];
    try {
      names = readdirSync(join(target, rel));
    } catch {
      unreadable++;
      continue;
    }
    for (const name of names) {
      const path = rel ? `${rel}/${name}` : name;
      let st: ReturnType<typeof lstatSync>;
      try {
        st = lstatSync(join(target, path));
      } catch {
        unreadable++;
        continue;
      }
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
const read = (path: string) => {
  if (!regular(path)) return null;
  try {
    return readFileSync(join(target, path), "utf-8");
  } catch {
    unreadable++;
    return null;
  }
};

/**
 * Claude Code loads agent files from the folder it started in, from its parents, and from its subfolders on demand. The
 * audited project must be none of them.
 */
function overlaps(): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const [here, there] = [real("."), real(target)];
  /** `a` is `b` or a folder under it. */
  const inside = (a: string, b: string) => {
    const r = relative(b, a);
    return r === "" || (r.split(sep)[0] !== ".." && !isAbsolute(r));
  };
  return inside(here, there) || inside(there, here);
}

const entries = walk();
const fingerprint = fingerprintOf(entries, (text) => createHash("sha256").update(text).digest("hex").slice(0, 16));
if (command === "fingerprint") out({ fingerprint, truncated });

/**
 * A path under `base` in which no part is a symbolic link and no part is `.` or `..`, ending in a regular file or a
 * folder. Anything else is null: git's files are read without ever leaving their folder.
 */
function safeUnder(base: string, rel: string, kind: "file" | "dir"): string | null {
  const parts = rel.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) return null;
  let path = base;
  try {
    if (!lstatSync(base).isDirectory()) return null;
    for (const [i, part] of parts.entries()) {
      path = join(path, part);
      const st = lstatSync(path);
      const ok = i < parts.length - 1 || kind === "dir" ? st.isDirectory() : st.isFile();
      if (!ok) return null;
    }
  } catch {
    return null;
  }
  return path;
}

/** git's own files are small; a larger one (a hostile `packed-refs`, say) is not read. */
const MAX_GIT_FILE_BYTES = 5_000_000;

const readUnder = (base: string, rel: string) => {
  const path = safeUnder(base, rel, "file");
  try {
    if (path && lstatSync(path).size > MAX_GIT_FILE_BYTES) {
      unreadable++;
      return null;
    }
    return path ? readFileSync(path, "utf-8") : null;
  } catch {
    unreadable++;
    return null;
  }
};

/** Ref files under a folder of git's directory, without following symbolic links. */
function refsUnder(common: string, sub: string): string[] {
  if (!safeUnder(common, sub, "dir")) return [];
  const found: string[] = [];
  const stack = [sub];
  while (stack.length && found.length < 1000) {
    const rel = stack.pop() ?? "";
    let names: string[];
    try {
      names = readdirSync(join(common, rel));
    } catch {
      continue;
    }
    for (const name of names) {
      const path = `${rel}/${name}`;
      try {
        const st = lstatSync(join(common, path));
        if (st.isDirectory()) stack.push(path);
        else if (st.isFile()) found.push(path);
      } catch {
        unreadable++;
      }
    }
  }
  return found;
}

/** git state known to exist but not readable safely: the map says "repository", with branch and commit unknown. */
const UNKNOWN: GitFiles = { read: () => null, refs: () => [] };

/**
 * git's directory: the project's own `.git` folder; or, for a worktree, the folder its `.git` file points to. A
 * worktree's pointer is accepted only when it is `<repo>/.git/worktrees/<name>` and points back to this project, and its
 * refs come from that `<repo>/.git`. A pointer anywhere else is not followed.
 */
function gitFiles(): GitFiles | null {
  const dotGit = join(target, ".git");
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(dotGit);
  } catch {
    return null;
  }
  if (st.isDirectory()) return { read: (path) => readUnder(dotGit, path), refs: (sub) => refsUnder(dotGit, sub) };
  if (!st.isFile()) return UNKNOWN;
  const pointer = /^gitdir: (.+)$/m.exec(readUnder(target, ".git") ?? "")?.[1]?.trim();
  if (!pointer) return UNKNOWN;
  try {
    const dir = realpathSync(resolve(target, pointer));
    const worktrees = dirname(dir);
    const common = dirname(worktrees);
    const back = readUnder(dir, "gitdir")?.trim();
    const pointsBack = back ? realpathSync(resolve(dir, back)) === realpathSync(dotGit) : false;
    if (basename(worktrees) !== "worktrees" || basename(common) !== ".git" || !pointsBack) return UNKNOWN;
    return { read: (path) => (path === "HEAD" ? readUnder(dir, "HEAD") : readUnder(common, path)), refs: (sub) => refsUnder(common, sub) };
  } catch {
    return UNKNOWN;
  }
}

const files = entries.map((e) => e.path).filter((p) => !p.startsWith(".git/"));
out({
  target: {
    /** The project is, contains or is inside the folder Claude Code started in: its agent files load as instructions. */
    overlapsWorkingFolder: overlaps(),
    empty: files.length === 0,
    fromTemplate: files.includes(".copier-answers.yml") && /ai-dev-template/.test(read(".copier-answers.yml") ?? ""),
  },
  git: gitState(gitFiles()),
  map: auditMap({ files, read, size: (path) => (regular(path) ? lstatSync(join(target, path)).size : Number.MAX_SAFE_INTEGER) }),
  fingerprint,
  /** The walk stopped at the file limit: the map and the fingerprint cover part of the folder only. */
  truncated,
  unreadable,
});
