import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evidencePaths, renderIssue, safe, section, tableRows, weekStart } from "../../scripts/direction/lib.ts";

const PRD = `# PRD
## 3. Acceptance criteria
| ID | Criterion | How to verify |
|---|---|---|
| CA-01 | a | b |
| CA-02 | c | d |
## 4. Non-negotiables
| ID | Rule | Test |
|---|---|---|
| INV-001 | e | f |
## 6. Direction check
| Requirement | Evidence | Status |
|---|---|---|
| CA-01 | \`tests/unit/exists.test.ts\` passing | ✅ |
| INV-001 | \`tests/invariants/gone.test.ts\` | ✅ |
`;
const HANDOFF = "## Queue (next items)\n\n1. M7\n\n## Pending decisions (owner)\n\n- decide X\n\n## Risks\n- r\n";

test("PRD: section by the start of the title (with or without number) and table rows", () => {
  assert.equal(tableRows(section(PRD, "Acceptance criteria") ?? "").length, 2);
  assert.deepEqual(tableRows(section(PRD, "Direction check") ?? "")[1], ["INV-001", "`tests/invariants/gone.test.ts`", "✅"]);
  assert.equal(section(HANDOFF, "Queue"), "1. M7");
  assert.equal(section(PRD, "Does not exist"), null);
});

test("evidence: only file paths in backticks; commands are left out", () => {
  assert.deepEqual(evidencePaths("`tests/unit/a.test.ts` and `npm run eval` and `src/ai/llm.ts`"), ["tests/unit/a.test.ts", "src/ai/llm.ts"]);
});

test("the week starts on Monday (UTC)", () => {
  assert.equal(weekStart(new Date("2026-10-21T06:00:00Z")), "2026-10-19");
  assert.equal(weekStart(new Date("2026-10-25T23:00:00Z")), "2026-10-19", "Sunday still belongs to the previous week");
  assert.equal(weekStart(new Date("2026-10-19T00:00:00Z")), "2026-10-19");
});

test("PR title is data: no table break, mention or HTML", () => {
  assert.equal(safe("a | b\n@owner <script>"), "a \\| b @​owner &lt;script>");
  assert.equal(safe("[click](http://x) #12 `c`"), "\\[click\\]\\(http://x\\) #\u200b12 \\`c\\`", "no clickable link or reference");
  assert.equal(safe("x".repeat(200), 10).length, 10);
});

test("issue: missing evidence, requirement without a row, stalled PR and HANDOFF sections", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  const { title, body } = renderIssue({
    now,
    prd: PRD,
    handoff: HANDOFF,
    exists: (p) => p === "tests/unit/exists.test.ts",
    merged: [{ number: 6, title: "M5 | evals", html_url: "u6", updated_at: "2026-10-21T00:00:00Z", merged_at: "2026-10-21T00:00:00Z" }],
    open: [{ number: 7, title: "old", html_url: "u7", draft: true, updated_at: "2026-10-01T00:00:00Z" }],
    mainCi: { conclusion: "failure", status: "completed", html_url: "r", created_at: "2026-10-20T00:00:00Z" },
    canary: null,
  });
  assert.equal(title, "Direction check: week of 2026-10-19");
  assert.match(body, /^<!-- direction-check -->/);
  assert.match(body, /CI on `main`: ❌ failure/);
  assert.match(body, /\| CA-01 \| .* \| cited files exist \|/);
  assert.match(body, /❌ does not exist: `tests\/invariants\/gone\.test\.ts`/);
  assert.match(body, /No row in the direction table: CA-02\./);
  assert.match(body, /\[#6\]\(u6\) M5 \\\| evals/);
  assert.match(body, /draft \| 20 day\(s\) ⚠️ stalled/);
  assert.match(body, /### Queue\n\n1\. M7/);
  assert.match(body, /### Pending decisions\n\n- decide X/);
});

test("flow: opens the issue the first time and updates the same one (with a comment) after that", async () => {
  const calls: string[] = [];
  const issues: Array<{ number: number; body: string; user: { login: string }; html_url: string }> = [
    { number: 1, body: "<!-- direction-check --> made by a person", user: { login: "intruder" }, html_url: "i1" },
  ];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const url = req.url ?? "";
      calls.push(`${req.method} ${url.replace(/\?.*/, "")}`);
      let out: unknown = [];
      if (url.includes("/actions/workflows/")) out = { workflow_runs: [] };
      else if (req.method === "POST" && url.endsWith("/issues")) {
        const body = (JSON.parse(raw) as { body: string }).body;
        issues.push({ number: 2, body, user: { login: "github-actions[bot]" }, html_url: "i2" });
        out = { html_url: "i2" };
      } else if (url.startsWith("/repos/o/r/issues?")) out = issues;
      else if (req.method !== "GET") out = {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const env = { ...process.env, GITHUB_TOKEN: "fake", GITHUB_REPOSITORY: "o/r", GITHUB_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  try {
    const run = promisify(execFile);
    await run("node", ["scripts/direction/run.ts"], { env });
    assert.ok(calls.includes("POST /repos/o/r/issues"), "opens a new issue (the person's one does not count)");
    calls.length = 0;
    await run("node", ["scripts/direction/run.ts"], { env });
    assert.ok(calls.includes("PATCH /repos/o/r/issues/2"), "updates the bot's issue");
    assert.ok(calls.includes("POST /repos/o/r/issues/2/comments"), "comments to notify the owner");
    assert.ok(!calls.includes("POST /repos/o/r/issues"), "does not open another one");
  } finally {
    server.close();
  }
});
