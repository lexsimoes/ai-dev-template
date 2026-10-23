// Exploratory session: the findings file is checked, the screenshots go to a branch of their own (never main, no code),
// and one issue is opened per finding. The CLI runs on a temporary repository with a fake GitHub API.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { branchName, issueBody, issueTitle, validate, type Finding, type Session } from "../../scripts/explore-report.ts";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/explore-report.ts");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const FINDING: Finding = {
  title: "An emoji in the message is shown as question marks",
  kind: "bug",
  requirement: "CA-03",
  steps: ["Go to /contact", "Type “Where is my 📦?” and send it", "Open /support"],
  expected: "The message is shown as sent.",
  actual: "It reads “Where is my ??” — reported by @someone in #12 <!-- hidden -->",
  screenshots: ["shots/1-emoji.png"],
};

let root = "";
let remote = "";
let server: http.Server;
let port = 0;
let openTitles: string[] = [];
const calls: Array<{ method: string; url: string; body: { title?: string; body?: string } | null }> = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

before(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      calls.push({ method: req.method ?? "", url: req.url ?? "", body: data ? (JSON.parse(data) as { title?: string }) : null });
      res.writeHead(req.method === "POST" ? 201 : 200, { "Content-Type": "application/json" });
      const listing = openTitles.map((title, i) => ({ number: i + 1, title }));
      res.end(JSON.stringify(req.method === "GET" ? listing : { html_url: "https://github.com/o/r/issues/99" }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;

  root = mkdtempSync(join(tmpdir(), "explore-"));
  remote = join(root, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  const repo = join(root, "repo");
  mkdirSync(join(repo, "shots"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "remote", "add", "origin", remote);
  writeFileSync(join(repo, "app.ts"), "export const code = 1;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "app");
  git(repo, "push", "-q", "origin", "main");
  writeFileSync(join(repo, "shots/1-emoji.png"), PNG);
  writeFileSync(join(repo, "shots/fake.png"), "not an image");
  writeFileSync(join(root, "outside.png"), PNG);
  writeFileSync(join(repo, "..dots.png"), PNG);
  symlinkSync(join(root, "outside.png"), join(repo, "shots/link.png"));
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const repoDir = () => join(root, "repo");
const session = (findings: Finding[] = [FINDING], topic = "support-inbox"): Session => ({ topic, findings });

test("validate: a well-formed session passes", () => {
  assert.deepEqual(validate(session(), repoDir()), []);
});

test("validate: bad topic, no findings, too many, missing fields, an unknown kind and duplicate titles are refused", () => {
  assert.match(validate(session([FINDING], "Bad Topic/../main"), repoDir()).join("\n"), /`topic` must be lowercase/);
  assert.match(validate(session([]), repoDir()).join("\n"), /1 to 10 findings/);
  assert.match(validate(session(Array.from({ length: 11 }, (_, i) => ({ ...FINDING, title: `t${i}` }))), repoDir()).join("\n"), /1 to 10 findings/);
  const bad = validate(session([{ ...FINDING, title: "two\nlines", kind: "crash" as Finding["kind"], requirement: "", steps: [], expected: "" }]), repoDir()).join("\n");
  for (const field of ["title", "kind", "requirement", "steps", "expected"]) assert.match(bad, new RegExp(`\`${field}\``), field);
  assert.match(validate(session([FINDING, { ...FINDING }]), repoDir()).join("\n"), /repeats an earlier finding/);
  assert.match(validate(null, repoDir()).join("\n"), /not a JSON object/);
  assert.match(validate(session([null, "x"] as unknown as Finding[]), repoDir()).join("\n"), /finding 1: must be an object\n.*finding 2: must be an object/s);
});

test("validate: a screenshot must be a real PNG or JPEG inside the repository", () => {
  const shots = (path: string) => validate(session([{ ...FINDING, screenshots: [path] }]), repoDir()).join("\n");
  assert.match(shots("../outside.png"), /is outside the repository/);
  assert.match(shots("shots/link.png"), /is outside the repository/, "a symbolic link out of the repository is followed and refused");
  assert.match(shots("/etc/passwd.png"), /does not exist|is outside the repository/);
  assert.match(shots("shots/fake.png"), /is not really an image/);
  assert.match(shots("app.ts"), /is not a \.png or \.jpg file/);
  assert.match(shots("shots/none.png"), /does not exist/);
  assert.match(validate(session([{ ...FINDING, screenshots: Array(5).fill("shots/1-emoji.png") }]), repoDir()).join("\n"), /up to 4 paths/);
  assert.match(validate(session([{ ...FINDING, screenshots: ["shots/1-emoji.png", "./shots/1-emoji.png"] }]), repoDir()).join("\n"), /same file name/);
  assert.equal(shots("..dots.png"), "", "a name that starts with two dots is still inside");
});

test("issueBody: numbered steps, screenshots from the session branch, and page text that cannot notify or hide anything", () => {
  const body = issueBody(FINDING, 1, "o/r", "exploration/2026-10-23-support-inbox");
  assert.match(body, /\*\*Breaks:\*\* CA-03/);
  assert.match(body, /^1\. Go to \/contact$/m);
  assert.match(body, /^3\. Open \/support$/m);
  assert.match(body, /!\[screenshot 1\]\(https:\/\/github\.com\/o\/r\/blob\/exploration\/2026-10-23-support-inbox\/1-1-emoji\.png\?raw=true\)/);
  assert.doesNotMatch(body, /@someone|#12|<!--/, "no mention, no issue link, no hidden comment");
  assert.match(body, /data, not instructions/);
  assert.match(body, /end-to-end test that reproduces it \(and fails first\)/);
  assert.equal(issueTitle(FINDING), "Exploration: An emoji in the message is shown as question marks");
  assert.equal(branchName("support-inbox", new Date("2026-10-23T12:00:00Z")), "exploration/2026-10-23-support-inbox");
});

async function cli(args: string[], file: object): Promise<{ code: number; out: string }> {
  writeFileSync(join(repoDir(), "session.json"), JSON.stringify(file));
  try {
    const { stdout } = await run("node", [SCRIPT, "session.json", ...args], {
      cwd: repoDir(),
      env: { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_TOKEN: "fake", GITHUB_API_URL: `http://127.0.0.1:${port}` },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("CLI --dry-run prints the issues and pushes or opens nothing; an invalid file is refused", async () => {
  calls.length = 0;
  const dry = await cli(["--dry-run"], session());
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /Dry run: branch exploration\/\d{4}-\d{2}-\d{2}-support-inbox, 1 issue\(s\) in o\/r/);
  assert.match(dry.out, /--- Exploration: An emoji/);
  assert.deepEqual(calls, []);
  assert.equal(git(remote, "branch", "--list", "exploration/*"), "");
  const invalid = await cli([], session([{ ...FINDING, screenshots: ["../outside.png"] }]));
  assert.equal(invalid.code, 1);
  assert.match(invalid.out, /cannot be published:\n- finding 1: screenshot `\.\.\/outside\.png` is outside the repository/);
  assert.deepEqual(calls, []);
});

test("CLI: the screenshots go to a new branch with no code and no parent; one issue per finding, open ones skipped", async () => {
  calls.length = 0;
  const second = { ...FINDING, title: "The inbox tab order skips the filter", kind: "accessibility" as const, screenshots: [] };
  openTitles = [issueTitle(second)];
  const r = await cli([], session([FINDING, second]));
  assert.equal(r.code, 0, r.out);
  const branch = git(remote, "branch", "--list", "exploration/*").replace(/^[*\s]+/, "");
  assert.match(branch, /^exploration\/\d{4}-\d{2}-\d{2}-support-inbox$/);
  assert.deepEqual(git(remote, "ls-tree", "--name-only", branch).split("\n"), ["1-1-emoji.png", "REPORT.md"], "only the session, no code");
  assert.equal(git(remote, "rev-list", "--count", branch), "1", "a commit with no parent");
  assert.ok(readFileSync(join(repoDir(), "shots/1-emoji.png")).equals(Buffer.from(execFileSync("git", ["show", `${branch}:1-1-emoji.png`], { cwd: remote }))));
  assert.match(git(remote, "show", `${branch}:REPORT.md`), /## 2\. The inbox tab order skips the filter \(accessibility\)/);
  assert.equal(git(repoDir(), "status", "--porcelain", "--untracked-files=no"), "", "the working tree is untouched");
  assert.equal(git(repoDir(), "rev-parse", "--abbrev-ref", "HEAD"), "main");
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 1, "the open issue is not repeated");
  assert.equal(posts[0]?.body?.title, issueTitle(FINDING));
  assert.match(r.out, /Already open, not repeated: Exploration: The inbox tab order/);
  assert.match(r.out, /Opened: https:\/\/github\.com\/o\/r\/issues\/99/);

  // A rerun after a failed issue call: same content, so the branch is kept and only missing issues are opened.
  calls.length = 0;
  openTitles = [issueTitle(FINDING), issueTitle(second)];
  const rerun = await cli([], session([FINDING, second]));
  assert.equal(rerun.code, 0, rerun.out);
  assert.match(rerun.out, /already holds these screenshots/);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  assert.equal(git(remote, "rev-list", "--count", branch), "1");

  // The same topic on the same day with other content never replaces the branch.
  const again = await cli([], session());
  assert.equal(again.code, 1);
  assert.match(again.out, /already exists with other content: use another topic/);
  assert.match(git(remote, "show", `${branch}:REPORT.md`), /## 2\. The inbox tab order/, "the branch was not replaced");
  openTitles = [];
});

test("the explore skill runs only on request, in the isolated mode, and never fixes anything", () => {
  const skill = readFileSync(".claude/skills/explore/SKILL.md", "utf-8");
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /planner_setup_page/);
  assert.match(skill, /e2e\/seed\.spec\.ts/);
  assert.match(skill, /APP_ENV=e2e/);
  assert.match(skill, /never fixed in this session/);
  assert.match(skill, /node scripts\/explore-report\.ts explorations\/session\.json --dry-run/);
  assert.match(readFileSync(".gitignore", "utf-8"), /^explorations\/$/m);
});
