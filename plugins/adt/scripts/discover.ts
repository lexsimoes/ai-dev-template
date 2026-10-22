// /adt:discover: the deterministic steps around the product conversation. Prints JSON for Claude to explain.
// It reads the project and never writes: Claude writes the PRD and missions, the owner approves, `check` verifies.
//
// In the project folder:
//   node <plugin>/scripts/discover.ts inspect                  folder, PRD state, demo app, next invariant ID and mission, git
//   node <plugin>/scripts/discover.ts suggest --needs ui,react  skills and MCPs from the fixed catalog (catalog.json)
//   node <plugin>/scripts/discover.ts check [--prototype T]    checks of the written PRD and missions (exit 1 on a problem)

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { checkDiscovery, openMissions, parseNeeds, projectState, suggestTools } from "./lib/discover.ts";
import type { Files, Tool } from "./lib/discover.ts";
import { inspectFolder } from "./lib/new-project.ts";
import type { Template } from "./lib/new-project.ts";
import { parseAnswers } from "./lib/project.ts";
import { run } from "./lib/run.ts";

const plugin = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf-8")) as unknown;
const template = plugin("template.json") as Template;
const dir = process.cwd();
const files: Files = {
  read: (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf-8") : null),
  list: (path) => (existsSync(join(dir, path)) ? readdirSync(join(dir, path)) : []),
};

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

const parsed = (() => {
  try {
    return parseArgs({ allowPositionals: true, options: { needs: { type: "string", default: "" }, prototype: { type: "string" } } });
  } catch (e) {
    return out({ errors: [e instanceof Error ? e.message.split("\n")[0] : String(e)] }, true);
  }
})();
const { positionals, values } = parsed;
const command = positionals[0];

if (command === "inspect") {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = run("git", ["--no-optional-locks", "status", "--porcelain"]);
  const language = parseAnswers(files.read(".copier-answers.yml") ?? "").conversation_language;
  out({
    folder: inspectFolder(readdirSync(dir), files.read, template),
    language: language === "en" || language === "pt-BR" ? language : null,
    state: projectState(files),
    git: {
      branch: branch.code === 0 && /^[\w./-]{1,100}$/.test(branch.stdout.trim()) ? branch.stdout.trim() : null,
      clean: status.code === 0 ? status.stdout.trim() === "" : null,
    },
    today: new Date().toISOString().slice(0, 10),
  });
}

if (command === "suggest") {
  const n = parseNeeds(values.needs);
  if ("errors" in n) out({ errors: n.errors }, true);
  const catalog = plugin("catalog.json") as { checked: string; tools: Tool[] };
  out({ checked: catalog.checked, tools: suggestTools(catalog.tools, n.needs) });
}

if (command === "check") {
  const result = checkDiscovery({
    prd: files.read("specs/PRD.md"),
    missions: openMissions(files),
    invariants: projectState(files).invariants,
    prototype: values.prototype,
  });
  out(result, !result.ok);
}

out({ errors: ["usage: discover.ts inspect | suggest --needs … | check [--prototype <topic>]"] }, true);
