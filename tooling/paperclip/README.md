# @halonicjs/tooling-paperclip

Scripts that run beside Paperclip, the control plane our agents work in,
without a model: the PR watcher, and the reviewer path list that it and the
reviewer-routing check share.

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-paperclip` (the PR watcher's `tick`, `decide` and its readers; `reviewerFor`, `isLiamPath` and the path lists)
- **Requirements:** `paperclip.pr-watcher-done`, `paperclip.pr-watcher-wake`, `paperclip.pr-watcher-read-only`, `paperclip.reviewer-paths`

## PR watcher

Replaces the model runs that only ask "is my PR green, has it merged, does
it need a rebase" (the seat plan on HAL-15298, section 3, item 2). Every
10 minutes it looks at every open task (`todo`, `in_progress`, `in_review`)
that has a pull request linked as a **`pull_request` work product**. It
doesn't search comments, so a pull request that isn't linked that way isn't
watched.

It acts only when the task is held by the agent its branch names
(`mateo/HAL-1-…` belongs to Mateo). When the reviewer holds it, or the
author already has a run going, it does nothing.

| What it sees | What it does |
| --- | --- |
| Every linked pull request is closed, at least one merged, and each merged one has `ci-ok` passed on its merge commit (the merge-group run) or is included in the base branch's newest green CI push run, and the author hasn't held the task (below) | Comments and marks the task `done` |
| `ci-ok` failed on an open pull request's own head | Comments, which wakes the author |
| It conflicts with its base branch and isn't in the merge queue | Comments |
| A review comment newer than the watcher's and the author's last comment on the task: a GitHub review that requests changes, an inline comment on the head, or a review or conversation comment with a `[blocker]`, `[major]` or `[minor]` finding or a "changes requested" verdict ("No changes requested" and approvals don't count) | Comments |

**More PRs to come.** A task that delivers several pull requests one after
another would otherwise be closed after its first merge. To hold it open,
put this line in your task comment when you link a pull request that isn't
the last one:

```text
PR watcher: more PRs to come
```

The watcher reads only your newest comment on the task: the hold lasts until
you comment again without the line. Leave it out of the comment for the last
pull request.

A failed merge group isn't the author's: the queue session finds the
culprit. Each comment carries a hidden marker per pull request, head and
reason, so the author hears about each new state once, not every 10
minutes. The watcher keeps no state of its own.

It only sends GET requests to GitHub, and only to `api.github.com`. About
four requests per open pull request and two per merged one each pass.

### Running it

From the root of a clone of `main`:

```sh
pnpm exec node tooling/paperclip/src/cli/pr-watcher.ts --dry-run
```

`--dry-run` prints what it would do and writes nothing. It reads `GH_TOKEN`
and the `PAPERCLIP_*` variables a Paperclip run sets (`PAPERCLIP_API_URL`,
`PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_ID`, and
`PAPERCLIP_RUN_ID` when there is one). It exits with 1 when it couldn't
check a task, and names the task.

### The watcher agent

- **Adapter:** `process`, running the command above without `--dry-run`, in a
  clone of `main` that it updates first (`git pull --ff-only`).
- **Heartbeat:** every 10 minutes. No model.
- **Secrets:** only `PR_WATCHER_GITHUB_TOKEN`, given to it as `GH_TOKEN`: a
  fine-grained token for `halonic-com/halonic` and `halonic-com/website`,
  read-only (pull requests, checks, commit statuses, actions, contents).
- **Paperclip:** its own key. It writes only task comments and the `done`
  status.

## Reviewer path list

`reviewerFor({ files, changedLines, sensitive })` answers `julian` or `liam`
by the rules of HAL-14809. Scripts that route pull requests import it from
here, so there is only one list.
