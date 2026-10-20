# Pull Request Creation Guidelines

`node .github/scripts/scm/scm.mjs pr-create` generates the `## Changes` file-summary and work-item links itself — these guidelines only cover the part you write.

## Principles

- **Be concise** — 1-2 sentences per section, not paragraphs
- **No boilerplate** — omit sections that have nothing to report
- **Link, don't repeat** — the script links the work item; never restate its acceptance criteria
- **Don't list files** — the script's `## Changes` section already does; describe *behavior* changes instead

## The 1500-Character Budget

The body you write (everything passed via `--body-file`) is capped at **1500 characters**. `scm.mjs pr-create` exits 2 with `PR body is N chars; limit 1500 - shorten the summary` if you go over — it never silently truncates your text. Write for the budget:

- **1-2 sentences**: what changed and why.
- **Bullet list of behavior changes** — not files (the script lists those) — one line each.
- **One line of test evidence per suite** (e.g. `Unit: 42/42 passing`), only if non-obvious.
- No restating the story's acceptance criteria — the work-item link is the reference.

## PR Description Format

```markdown
(1-2 sentences: what changed and why)

- (behavior change 1)
- (behavior change 2)

## Testing Notes

- Unit: 42/42 passing
- Integration: 8/8 passing
```

## Title Format

`[type]: concise description` — where type is `feat`, `fix`, `test`, `refactor`, or `chore`.

## Sizing Rules

The body you write stays roughly this size regardless of change size — the script's `## Changes` section scales with the diff, not your summary:

| Change Size | Your Summary |
| --- | --- |
| Small (1-3 files) | 1 sentence |
| Medium (4-10 files) | 1-2 sentences + 3-5 behavior-change bullets |
| Large (10+ files) | 2-3 sentences + grouped behavior bullets |

## What NOT to Include

- Test execution commands (reviewers know how to run tests)
- Architecture explanations (link to memory bank docs if relevant)
- File lists — `scm.mjs pr-create`'s `## Changes` section already has them
- Merge checklists (project-specific checklists live in the PR template, not here)
- Redundant restating of the tracker work item's acceptance criteria
