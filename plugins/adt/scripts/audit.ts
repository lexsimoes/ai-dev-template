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
import { isAbsolute, join, relative, resolve, sep } from "node:path";
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

/** Plain files of a folder outside the walk (git's own), read with the same care: regular files only. */
function plain(path: string): string | null {
  try {
    return lstatSync(path).isFile() ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

/** git's directory: `.git`, or the folder a worktree's `.git` file points to (with its `commondir` for the refs). */
function gitFiles(): GitFiles | null {
  const dotGit = join(target, ".git");
  let dir: string;
  try {
    if (lstatSync(dotGit).isDirectory()) dir = dotGit;
    else {
      const pointer = /^gitdir: (.+)$/m.exec(plain(dotGit) ?? "")?.[1]?.trim();
      if (!pointer) return null;
      dir = resolve(target, pointer);
    }
  } catch {
    return null;
  }
  const common = resolve(dir, plain(join(dir, "commondir"))?.trim() || ".");
  const refs = (sub: string): string[] => {
    const out: string[] = [];
    const stack = [sub];
    while (stack.length && out.length < 1000) {
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
          else if (st.isFile()) out.push(path);
        } catch {
          unreadable++;
        }
      }
    }
    return out;
  };
  return { read: (path) => plain(join(path === "HEAD" ? dir : common, path)), refs };
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
