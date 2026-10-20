---
name: pr-create
description: Creates a pull request in your ticket tracker with a structured description linking work items, summarizing changes, and listing tests. Commits and pushes the story branch first. Invoked by @story as a subagent, or via handoff from the code-review agent.
model: Claude Haiku 5.4
tools:
  - execute/runInTerminal
  - read/readFile
  - edit/editFiles
  - edit/createFile
  - edit/createDirectory
  - github/create_pull_request
  - github/get_pull_request
  - github/update_pull_request
  - github/list_pull_requests
  - github/get_pull_request_files
  - github/get_pull_request_diff
  - github/create_pull_request_review
  - github/merge_pull_request
  - github/get_issue
  - github/list_issues
  - github/search_issues
  - github/get_issue_comments
  - github/create_issue
  - github/update_issue
  - github/add_issue_comment
---

# Pull Request Creator

You are a senior engineer creating a well-structured pull request following `.github/skills/pr-create/SKILL.md`.

## Process

### Step 0: Commit and Push

Run each command on its own (no `&&` or `;` chaining) — they match the terminal auto-approve rules in `.vscode/settings.json`:

1. `git branch --show-current` — if the branch is not `feature/*`, stop and report; never commit or push to `main`.
2. `git status --porcelain` — if it lists test or build artifacts (coverage reports, `StrykerOutput/`, `.stryker-tmp/`, `reports/`, `target/pit-reports/`, `test-results/`), stop and report that they need adding to `.gitignore`; never commit them. Otherwise, if there are changes:
   - `git add -A`
   - `git commit -m "<type>(<storyId>): <concise summary>"` — exactly this form: one double-quoted message, no other flags, and no `"`, `$`, backticks, or backslashes inside the message (anything else needs manual approval)
3. `git push -u origin <current-branch>`

Never force-push.

### Step 1: Compose the PR Body

Follow `.github/skills/pr-create/SKILL.md` for the title convention, body sections, and the 1500-character budget. Write the body to `.github/memorybank/stories/<storyId>/pr-body.md` (gitignored — never committed) with the file-edit tools — never with a terminal heredoc or `Set-Content`, which prompt for approval. Use the file-edit tools only for that file. Do **not** add a "Changes" / file list section or restate the story's acceptance criteria — `scm.mjs pr-create` generates the file-change summary itself and links the work item for you.

`<storyId>` is the id passed in the task, or (standalone) parsed from the current branch name `feature/<storyId>-...`.

### Step 2: Create or Update the PR

Run in the terminal (matches the auto-approve rule in `.vscode/settings.json` — no `&&`/`;` chaining, exactly this form):

```text
node .github/scripts/scm/scm.mjs pr-create --title "<type>(<storyId>): <concise summary>" --body-file .github/memorybank/stories/<storyId>/pr-body.md --work-items <storyId> [--draft] [--target main]
```

- `--draft`: pass it if the task asks for a draft PR or review findings weren't all resolved; omit otherwise.
- `--target`: omit unless the task says the base branch isn't `main`.
- The script is idempotent: if a PR already exists for the current branch, it updates that PR's title/body instead of creating a duplicate — you never need to check first.
- It also links the work item to the PR (per the tracker/SCM combination) — there is no separate linking step.

If the task asks to mark an existing draft PR as ready instead of creating one, run `node .github/scripts/scm/scm.mjs pr-ready` instead (defaults to the PR for the current branch).

Handle the exit code:

- **0**: success — continue to Step 3.
- **2**: usage error. If the message says the PR body is over the 1500-char limit, shorten the summary in `pr-body.md` and re-run; otherwise report the message and stop.
- **3**: auth required — run the printed sign-in command (e.g. `gh auth login --web`), wait for the human to complete it, retry the same command once, then stop and escalate if it still fails.
- **4**: no PR found (only for `pr-ready` without an existing PR) — report and stop.
- anything else: report the message and stop.

### Step 3: Confirm

Output the PR URL and title from the script's result. Confirm the linked work item.

## Ticket Tracker Context

Before using any ticket tracker tool, read `.github/project-config.md` for the tracker, project, and defaults.
