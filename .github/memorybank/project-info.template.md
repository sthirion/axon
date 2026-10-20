# Ticket Tracker Project Info (Template)

> Detailed tracker reference for agents. Copy this file to `project-info.md` and fill in
> your project's real values. Agents read `project-info.md` for suite descriptions,
> backlogs, work-item type usage, and a running log of recent work items.
>
> Machine values the scripts need (org, project, area path, labels, field keys, test
> plan/suite ids) live in `.github/scripts/tracker/tracker.config.json` instead — this file holds
> only human/LLM context, not ids or keys. This example uses Azure DevOps terminology —
> adapt for your tracker (GitHub Issues, Jira, etc.).

## Test Plans

> Suite descriptions below are keyed by name; plan/suite **ids** live in
> `tracker.config.json` (`testPlan.planId` / `testPlan.suiteId`).

## Notable Suites

| Suite Name | Description |
| ---------- | ----------- |
| `<name>`   | `<suite description>` |

## Backlogs

| Team | Backlog | URL |
| ---- | ------- | --- |
| `<team>` | `<backlog name>` | `<backlog url>` |

## Work Item Types

| Type         | Use For                  | Key Fields                                 |
| ------------ | ------------------------ | ------------------------------------------ |
| `User Story` | Feature requirements     | Description, Acceptance Criteria           |
| `Bug`        | Defects and regressions  | ReproSteps, SystemInfo, Priority, Severity |
| `Task`       | Implementation sub-tasks | Description, Original Estimate             |
| `Test Case`  | Test suite entries       | Steps, AutomatedTestName                   |

## Recent Work Items

> Optional running log agents can append to for quick reference.

| ID    | Type | Title |
| ----- | ---- | ----- |
| `<id>` | `<type>` | `<title>` |
