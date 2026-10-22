# Manual test of the `adt` plugin (Mac)

A real run of the plugin, start to finish:
1. Install it from the marketplace.
2. Create a project in an empty folder.
3. Run it again (nothing should change).
4. Check the setup.
5. Make sure it refuses a folder with code.

About 15 minutes. It creates **one public repository** on your account (`adt-manual-test`), with no AI key, so it costs nothing.

Run it only once the PR that adds `/adt:new-project` is merged: the plugin installs from `main`.

## 0. Before you start (once)

In the Mac's **Terminal** (not inside Claude Code):

```bash
node --version            # v22.18.0 or newer
gh auth status            # "Logged in to github.com account <you>"
claude --version          # Claude Code (terminal command); see below if "command not found"
brew install pipx && pipx ensurepath
pipx install copier==9.18.2
copier --version          # copier 9.18.2
```

If `pipx ensurepath` says it changed the PATH, close and reopen the Terminal.

**`claude: command not found`:** the Claude Code desktop app and the VS Code extension do not install the `claude` command for the Terminal; this test needs it. Install it with the official installer (recommended in the Claude Code docs, code.claude.com/docs/en/setup), then **open a new Terminal window** and check again:

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude --version
```

(Alternative: `brew install --cask claude-code`.) The first time you run `claude`, it asks you to log in. Plugins installed from the Terminal are also available in the desktop app's local sessions and in VS Code.

## 1. Install the plugin from the marketplace

```bash
claude plugin marketplace add lexsimoes/ai-dev-template
claude plugin install adt@ai-dev-template
claude plugin details adt@ai-dev-template
```

If you had already added the marketplace before (for example, before this plugin was renamed `adt`), Claude Code keeps its earlier copy: updates of third-party marketplaces are off by default. Refresh it first, then install:

```bash
claude plugin marketplace update ai-dev-template
```

Expected:
- `Successfully added marketplace: ai-dev-template` (or the update), then `Successfully installed plugin: adt@ai-dev-template`.
- `Plugin "adt" not found in marketplace` means the marketplace copy is older than `main`: run the update above.
- `details` lists 2 skills: `check-setup` and `new-project`.

(Inside Claude Code the same thing works with `/plugin marketplace add lexsimoes/ai-dev-template` and `/plugin install adt@ai-dev-template`, which open the plugin panel.)

## 2. New project in an empty folder

```bash
mkdir -p ~/Projects/adt-manual-test && cd ~/Projects/adt-manual-test
claude
```

In Claude Code, type `/adt:new-project`. Expected:

1. It says the folder is empty and checks the prerequisites (all OK).
2. In **one message**, it proposes:
   - the name and repository `adt-manual-test` on your account;
   - public or private;
   - conversation language `pt-BR` (because you write in Portuguese);
   - the AI review options;
   - evals;
   - the optional sections.
   
   Answer: **public**, **no key**, the rest as proposed.
3. It repeats the answers and waits for your "ok". Nothing is created before that.
4. After the "ok", it creates the files (Copier, release `v0.1.0`) and the first commit, then on GitHub:
   - the repository with the first push;
   - the 5 labels;
   - the `protect-main` ruleset.
5. Keys: it says in one line that the project is in no-key mode, and it **does not ask for any key**.
6. It runs the setup check and ends with: **Created**, **Pending** (maybe "CI still running on `main`") and **Next step** (the first PR).

Write down whether Claude Code **asked permission** before running each `node …/new-project.ts …` and `node …/check-setup.ts` command. Expected:
- `inspect`, `preflight` and `check-setup` run without asking;
- `create` and `setup` ask, because they change things.

## 3. Same command, again

Still in that folder, run `/adt:new-project` again. Expected:
- it recognizes the project;
- it asks only public/private;
- every step comes back as **already exists**: no new repository, no duplicated label, no second ruleset.

## 4. Setup check

Run `/adt:check-setup`. Expected:
- ✅ for GitHub CLI, repository, labels, protection of `main` and template version (`v0.1.0`, the latest release);
- reviewer and evals in no-key mode;
- CI on `main` ✅, or ⚠️ if it is still running (run it again in a minute).

## 5. A folder with code is left untouched

```bash
cd ~/Projects/ai-dev-template && git status --short   # note what it shows (ideally nothing)
claude
```

Run `/adt:new-project`. Expected:
- it says the folder already has files, suggests `/adt:audit` (read-only), and **stops**;
- afterwards, `git status --short` shows exactly what it showed before.

## 6. Send me

- The final message of step 2 (Created / Pending / Next step).
- The answers to step 3, and to step 2's question about permissions.
- The table from step 4.
- Anything that differed from "Expected".

## 7. Product discovery (`/adt:discover`)

About 10 minutes. It needs a project created by `/adt:new-project`. If you already deleted `adt-manual-test`, run steps 2 to 4 again first.

Run it once the release that brings `/adt:discover` is published. Claude Code updates a plugin only when its version changes, and the version changes only in a release (`claude plugin update` answers "already at the latest version" otherwise). Then:

```bash
claude plugin marketplace update ai-dev-template
claude plugin update adt@ai-dev-template
cd ~/Projects/adt-manual-test && git switch main && git pull
claude
```

Type `/adt:discover`. Expected:
1. It asks **8 numbered questions in one message**, in Portuguese.
2. Answer as a small business of your choice. In question 4, give at least one thing that must never happen. In question 8, give one doubt (for example, whether an AI understands informal messages).
3. It writes `specs/PRD.md`, one or more missions in `docs/missions/` and `docs/HANDOFF.md`. It runs `check` until `ok`.
   - When the demo app is still there, mission 0001 removes it.
   - Each non-negotiable starts at `INV-003` and has a list of cases.
4. It suggests skills and MCPs with their install command, and **installs nothing**.
5. It shows a summary and **waits for your "ok"**. Before you answer, in another Terminal window:

   ```bash
   cd ~/Projects/adt-manual-test && git status --short   # changed PRD, HANDOFF and new missions; nothing in tests/invariants/
   ```

6. After the "ok", it creates the `mission/0000-discovery` branch and opens a PR. CI runs on it.

Send me:
- the questions;
- the summary from item 5;
- the PR link;
- anything that differed from "Expected".

## 7b. Read-only audit (`/adt:audit`)

About 10 minutes, after the same release as step 7. Pick an existing project of yours with code, for example GoAgentic.

```bash
cd ~/Projects/<your-project> && git status --short   # note what it shows
claude
```

Type `/adt:audit`. Expected:
1. It maps the project and reads a few files of each sensitive area.
2. In one message, it shows:
   - stack and scripts;
   - the tests that exist;
   - the sensitive areas, each with an example file;
   - the risks found;
   - an inferred PRD (criteria with existing tests, non-negotiables with evidence and cases);
   - its questions.
3. Environment variables appear **by name only**; it never asks for a value.
4. It ends by saying the fingerprint is the same as at the start.
5. Afterwards, `git status --short` shows exactly what it showed before.

Send me the report (in a private message if the project is private), and anything that differed from "Expected".

## 8. Cleaning up (when you want)

```bash
gh auth refresh -h github.com -s delete_repo   # once: lets gh delete repositories
gh repo delete lexsimoes/adt-manual-test --yes
rm -rf ~/Projects/adt-manual-test
```
