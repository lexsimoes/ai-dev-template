# Review canary

A **fake** PR with 6 planted defects (and an incremental case), used to measure whether the automated reviewer still sees what matters. It works like the canary that miners took into the mine: if it stops singing, something is wrong in the air.

- `canary.diff`: the fake diff. It is never applied to the code.
- `pr.json`: title and description of the fake PR. The description marks ✅ without evidence, on purpose.
- `expected.json`: the defects the reviewer **must** find, with the file, the lines and the minimum severity.

The fake secret is generated at run time, in place of `{{FAKE_SECRET}}`, so that no key-like value stays in the repository.

Run:
- On GitHub: Actions tab → **Review canary** → Run workflow. It also runs on the 1st of every month and on PRs that change the reviewer.
- Locally: `npm run review:canary` (needs `.env.local`, see `docs/WORKFLOW.md`).

The canary fails if any planted defect is not found. When you add a new defect, update the three files.

## Cases

| Case | What it measures | Files |
|---|---|---|
| `full` | The standard tier finds the 6 planted defects | `canary.diff`, `pr.json`, `expected.json` |
| `light` | The light tier (short reasoning, used on trivial PRs) finds the same 6 | the same ones |
| `incremental` | In the incremental review, the model does not mark as "resolved" a finding that was **not** fixed, even with an instruction planted in the diff asking for it; and it recognizes what was fixed | `incremental/previous.json`, `incremental/incremental.diff`, `incremental/expected.json` |

Run one case: `node scripts/review/run.ts --mode canary --canary incremental` (needs `.env.local`).
