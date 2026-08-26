# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations. Infer the repo from `git remote -v`; `gh` does this automatically inside a clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view NUMBER --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,assignees,comments`.
- **Comment**: `gh issue comment NUMBER --body "..."`.
- **Labels**: `gh issue edit NUMBER --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close NUMBER --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view NUMBER --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: one issue labelled `wayfinder:map`. `gh issue create --label wayfinder:map`.
- **Child ticket**: GitHub sub-issue of the map:

```bash
MAP_ID=$(gh api "repos/{owner}/{repo}/issues/{map_number}" --jq .id)
CHILD_ID=$(gh api "repos/{owner}/{repo}/issues/{child_number}" --jq .id)
gh api --method POST "repos/{owner}/{repo}/issues/{map_number}/sub_issues" -f sub_issue_id="$CHILD_ID"
```

Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`. Claim by assigning to the driving dev.

- **Blocking**: GitHub native issue dependencies. `{blocker_id}` is the blocker's numeric **database id** (`gh api repos/{owner}/{repo}/issues/{number} --jq .id`), not the `#number`:

```bash
gh api --method POST "repos/{owner}/{repo}/issues/{blocked_number}/dependencies/blocked_by" -F issue_id="$BLOCKER_DB_ID"
```

Where dependencies aren't available, fall back to `Blocked by: #A, #B` at the top of the child body. A ticket is unblocked when every blocker is closed.

- **Frontier query**: open children of the map with no open blocker and no assignee. First in map order wins.
- **Claim**: `gh issue edit NUMBER --add-assignee @me` as the session's first write.
- **Resolve**: `gh issue comment NUMBER --body "<resolution>"`, then `gh issue close NUMBER`, then append a context pointer (gist + link) to the map's Decisions so far.

The map is an **index**, not a store. Decisions live on their tickets. Do not paste `CONTEXT.md` or the Cursor briefing plan into the map body.
