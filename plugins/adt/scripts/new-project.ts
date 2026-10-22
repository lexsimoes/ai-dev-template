// /adt:new-project: creates a project from the pinned ai-dev-template release in the current (empty) folder and sets it up
// on GitHub. Idempotent: running a step again creates only what is missing. Prints JSON for Claude to explain.
//
// In the project folder:
//   node <plugin>/scripts/new-project.ts inspect      what the folder holds, suggested name, GitHub login, pinned release
//   node <plugin>/scripts/new-project.ts preflight    prerequisites (Node, git, gh login, Copier, release published)
//   node <plugin>/scripts/new-project.ts create --name N --slug S --owner O --language en|pt-BR \
//        --reviewer deepseek|anthropic|none --evals true|false --sections library-docs,ui-ux
//   node <plugin>/scripts/new-project.ts setup --owner O --slug S --visibility public|private
//
// It never reads, asks for or stores an API key: keys are set by the user, in their own terminal, with `gh secret set`.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { createProject, expectedSecrets, inspectFolder, preflight, setupLabels, setupRepo, setupRuleset, suggestNames, validateAnswers } from "./lib/new-project.ts";
import type { Context, Template } from "./lib/new-project.ts";
import { run } from "./lib/run.ts";

const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf-8")) as Template;
const dir = process.cwd();
const ctx: Context = { run, read: (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf-8") : null) };
const folder = () => inspectFolder(readdirSync(dir), ctx.read, template);

function out(result: unknown, failed = false): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

const parsed = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        name: { type: "string" },
        slug: { type: "string" },
        owner: { type: "string" },
        language: { type: "string" },
        reviewer: { type: "string" },
        evals: { type: "string" },
        sections: { type: "string", default: "" },
        visibility: { type: "string" },
      },
    });
  } catch (e) {
    return out({ errors: [e instanceof Error ? e.message.split("\n")[0] : String(e)] }, true);
  }
})();
const { positionals, values } = parsed;

const command = positionals[0];
if (command === "inspect") {
  const login = run("gh", ["api", "user", "--jq", ".login"]);
  out({
    folder: folder(),
    suggested: suggestNames(basename(dir)),
    login: login.code === 0 && /^[A-Za-z0-9-]{1,39}$/.test(login.stdout.trim()) ? login.stdout.trim() : null,
    template,
  });
}

if (command === "preflight") {
  const result = preflight(ctx, template, process.version);
  out(result, !result.ok);
}

if (command === "create") {
  const v = validateAnswers({ ...values, evals: values.evals });
  if ("errors" in v) out({ errors: v.errors }, true);
  const steps = createProject(ctx, v.answers, template, folder());
  out({ steps }, steps.some((s) => s.status === "failed"));
}

if (command === "setup") {
  const visibility = values.visibility === "public" || values.visibility === "private" ? values.visibility : null;
  const v = validateAnswers({ name: "x", slug: values.slug, owner: values.owner, language: "en", reviewer: "none", evals: "false", sections: "" });
  if (!visibility || "errors" in v) out({ errors: [...(visibility ? [] : ["visibility: public or private"]), ...("errors" in v ? v.errors : [])] }, true);
  if (folder().kind !== "adt-project") out({ errors: ["This folder is not a project from the template yet: run `create` first."] }, true);
  const login = run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
  const { slug, step } = setupRepo(ctx, v.answers, visibility);
  const steps = [step];
  if (slug) steps.push(setupLabels(ctx, slug), setupRuleset(ctx, slug, visibility, login));
  out({ repository: slug ? `https://github.com/${slug}` : null, steps, secrets: expectedSecrets(ctx.read) }, steps.some((s) => s.status === "failed"));
}

out({ errors: ["usage: new-project.ts inspect | preflight | create … | setup …"] }, true);
