# The adt commands: what each one does, and when

Shown by `/adt:guide`, and at the start of `/adt:new-project`. An agent shows it in the user's language, in plain words.

## Once, in Claude Code

Send these two commands one at a time (pasted together, they fail):

```
/plugin marketplace add lexsimoes/ai-dev-template
```

```
/plugin install adt@ai-dev-template
```

## A new project

| Step | Command | Where | When | What it does | Then you |
|---|---|---|---|---|---|
| 1 | `/adt:new-project` | an empty folder | first, once | Asks a few questions in one message: name, public or private, language, AI keys or none. Creates the project from the latest template release, then the GitHub repository, labels and the protection of `main`. Running it again finishes what is missing | Set each key it names in **your own terminal** (`gh secret set NAME`), never in the chat |
| 2 | `/adt:discover` | the new project | right after step 1 | Asks about the product in one message. For a product with screens, shows a clickable mockup (`prototype/mockup/index.html`, throwaway) before writing anything. Writes `specs/PRD.md` (acceptance criteria, non-negotiables) and the first missions, with the end-to-end tests as a mission of their own, then opens a PR | Click through the mockup and say what to change; then read the PR and merge it |
| 3 | no command: ask your agent "carry out mission NNNN" | the project | for each piece of work | The agent works on a branch, opens a draft PR, marks it ready, handles the automated review. Give the end-to-end tests mission to another agent than the one that wrote the code, when you have one | Read requirement → evidence → status, then merge. Agents never merge |
| any time | `/adt:check-setup` | the project | after step 1, or when a check behaves oddly | Checks login, repository, labels, protection, keys (names only), CI and the template version, with the fix for each problem | Fix what it lists |
| on request | `/explore <area>` | the project | when you want someone to try to break a flow | Walks the app in its isolated mode, opens one issue per problem with steps and screenshots. Fixes nothing | Turn a confirmed bug into a mission |

## A project that already has code

| Step | Command | Where | When | What it does | Then you |
|---|---|---|---|---|---|
| 1 | `/adt:audit <path>` | **a folder of your own, outside the project** | first | Read-only: maps the stack, tests, CI and sensitive areas, and infers a PRD. Asks which branch is the product. Proves it changed nothing | Confirm or correct the PRD |
| 2 | `/adt:adopt` | **inside the project**, on a new branch made from the product branch | after you confirm the PRD | Adds the workflow without overwriting anything: rules, reviewer, guards and, for a web UI, the end-to-end tester. Its checks run in observe mode and block nothing. Opens a PR | Decide each conflict it lists, then merge |
| 3 | `/adt:check-setup` | the project | every few weeks | Shows how often each observe check has been green | Make a check required when you trust it |

## Labels only you apply

- `invariant-approved`: a change to the non-negotiable tests.
- `eval-approved`: a change to the evals' reference cases.
- `test-approved`: a change to what an end-to-end test checks.
- `deep-review`: a review with the strongest model.

You or the agent may apply `re-review`: it reviews again what changed.

## A new template version

In a project created from the template, on a clean working tree: `copier update --defaults`. Read the template's CHANGELOG entries marked **Action needed**, review the diff, and open a PR.
