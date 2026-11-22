# @halonicjs/tooling-paperclip

Tools that run beside Paperclip, the control plane our agents work in,
without a model: the Agent tools plugin with its PR watcher and PR tools, the
reviewer path list that the watcher and the reviewer-routing check share, and
the merge queue's fill order (`queue.prio`).

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-paperclip` (the PR watcher's `tick`, `decide`, `discoverPulls` and its readers; the plugin's `manifest`, `runWatcher` and host adapter; `reviewerFor`, `isLiamPath` and the path lists; `queuePrio` and its weights)
- **Requirements:** `paperclip.pr-watcher-done`, `paperclip.pr-watcher-wake`, `paperclip.pr-watcher-read-only`, `paperclip.pr-watcher-plugin`, `paperclip.pr-tools`, `paperclip.reviewer-paths`, `paperclip.queue-prio`

## PR watcher

Replaces the model runs that only ask "is my PR green, has it merged, does
it need a rebase" (the seat plan on HAL-15298, section 3, item 2). It runs
as the `pr-watch` job of the Agent tools plugin (HAL-15920, trigger A1),
every 10 minutes.

**How it finds pull requests.** By branch name, as the root `AGENTS.md`
names branches: `mateo/HAL-15359-pr-watcher` is Mateo's work on HAL-15359.
Each run it lists every open pull request and every one updated in the last
3 days on the configured repositories, leaving out pull requests from forks
(anyone can name a fork's branch like ours). A pull request that merged more
than 3 days ago while its task stayed open is missed; close such a task by
hand. Nobody has to link pull requests on the task.

It looks at open tasks (`todo`, `in_progress`, `in_review`) and acts only
when every branch found for the task names the agent that holds it. When the
reviewer holds it, the branches name different agents, or the author already
has a run going, it does nothing and logs why.

| What it sees | What it does |
| --- | --- |
| Every pull request found for the task is closed, at least one merged, each merged one has `ci-ok` passed on its merge commit (the merge-group run) or is included in the base branch's newest green CI push run, the task has no child task that isn't done or cancelled, and the author hasn't held it (below) | Marks the task `done` and comments |
| `ci-ok` failed on an open pull request's own head | Comments and wakes the author |
| It conflicts with its base branch and isn't in the merge queue | Comments and wakes the author |
| A review comment newer than the watcher's and the author's last comment on the task: a GitHub review that requests changes, an inline comment on the head, or a review or conversation comment with a `[blocker]`, `[major]` or `[minor]` finding or a "changes requested" verdict ("No changes requested" and approvals don't count), by the repository's owner, an organization member or a collaborator | Comments and wakes the author |

Any open pull request keeps the task open, a stacked one included; one
closed without merging is ignored.

**More PRs to come.** A task that delivers several pull requests one after
another would otherwise be closed after its first merge. To hold it open,
put this line in your task comment when a pull request isn't the last one:

```text
PR watcher: more PRs to come
```

The watcher reads only your newest comment on the task: the hold lasts until
you comment again without the line. Leave it out of the comment for the last
pull request.

A failed merge group isn't the author's: the queue session finds the
culprit. Each comment starts with `PR watcher:` and carries a hidden marker
per pull request, head and reason, so the author hears about each new state
once, not every 10 minutes. The host stores no plugin id on a comment, so
the watcher's own comments are the ones with neither an agent nor a user as
author that start with `PR watcher:`. It keeps no state of its own.

It only sends GET requests to GitHub, and only to `api.github.com`. About
four requests per open pull request whose author holds the task, two per
merged one, and one or two list pages per repository each pass.

## The Agent tools plugin

`src/plugin/` holds the plugin: `manifest.ts`, `worker.ts` (the job),
`tools.ts` (the agent tools) and `host.ts`, the adapter to Paperclip's
plugin API. It asks for the fewest capabilities the watcher and the tools
need: jobs, reading companies, agents, tasks and comments, creating
comments, wake-ups, `issues.update`, outbound HTTP, reading a secret and
registering agent tools. No webhooks, UI, files or processes.

- **Status changes:** the manifest can't narrow `issues.update`, so
  `host.ts` is the only file that changes a task's status, and its
  `doneOnly` refuses anything but `{ status: "done" }`. A test fails if
  another file calls `issues.update(`.
- **Outbound HTTP:** the manifest can't list allowed hosts, so the GitHub
  reader's origin guard keeps the token on `api.github.com`.
- **Settings per company:** `githubToken` (the secret
  `PR_WATCHER_GITHUB_TOKEN`, a read-only fine-grained token), `repos`
  (default `halonic-com/halonic`) and `dryRun`. **Dry run is on unless it is
  set to `false`**: the job then only logs what it would do. A company
  without a token is skipped, and so is one with no saved settings: a
  scheduled job runs outside any company, so the host lets it read only the
  companies whose settings the board saved. `githubToken` is declared `type: "string"`
  with `format: "secret-ref"`: the host stores the secret binding there, but
  checks the field with the binding replaced by its secret id.
- **Trust:** a plugin worker runs with the host's rights and no sandbox. The
  token is read at run time and never logged or kept.

### Building and installing it

```sh
pnpm --filter @halonicjs/tooling-paperclip run build:plugin
```

writes `dist/worker.js` (the SDK bundled in) and `dist/manifest.js`, which
`package.json`'s `paperclipPlugin` block names. The board installs it from
that folder of a `main` checkout on Halonic Server (Settings → Plugins);
publishing it to npm would be a release. Run it in dry run first, read the
job log, then turn `dryRun` off.

## PR tools

Two agent tools (HAL-15920, B1) that replace a handful of `gh` calls with
one. Both read GitHub with GET requests only, through the same reader and
token as the watcher, and give up after 25 s.

- **`pr_status(pr, repo?)`**: one pull request by number or URL, on one of
  the plugin's `repos` (the first by default). It answers with the state,
  `ci-ok` on the head (the light run's `ci-ok (draft, light run)` while
  it's a draft), mergeable, commits behind its base, the merge queue, the
  reviewer by the path rules, the newest review finding on the head, and
  each signed approval ("Julian: approved on head `abc1234`") with whether
  it counts by the HAL-14809 rules, then what the author does next. The
  author says whether a pull request is a security or release one; the
  tool can't tell, so a counting approval from Julian carries that note.
  About 10 requests.
- **`my_prs()`**: the calling agent's open pull requests, the branches
  starting with its name, each with `ci-ok`, mergeable and whether a
  reviewer signed an approval on its head. The ones that conflict or have a
  red `ci-ok` come first, marked `NEEDS YOU`: the "check your open PRs
  first" rule (HAL-14785) in one call. About 3 requests per pull request.

## Reviewer path list

`reviewerFor({ files, changedLines, sensitive })` answers `julian` or `liam`
by the rules of HAL-14809. Scripts that route pull requests import it from
here, so there is only one list.

## Merge queue fill order (`queue.prio`)

`queuePrio({ ranked, open, tasks, now })` scores each ready pull request and
returns them highest first. The Merger calls it on every pass, so there is no
hourly `prio.json`. It lives in `src/rules/`, the code the supervision
plugins share; a change there counts as a merge-queue change, so Liam
reviews it.

| Part | Points |
| --- | --- |
| Each open pull request stacked on it (its base is this branch) | 100 |
| Each open task whose "blocked by" field names its task (HAL-14892) | 10 |
| Its own task's priority: critical, high, medium, low | 4, 3, 2, 1 |
| Aging: each full 2 hours since it became ready (HAL-14388) | 1, at most 24 |

Equal scores go oldest ready first, then lowest number. The task comes from
the branch name (`<agent>/<task id>-<name>`). Every result carries its parts,
so a dry-run log can say why one pull request went first.

To compare it with the Writer session's `prio.json`, feed it one snapshot:

```sh
pnpm exec node tooling/paperclip/src/cli/queue-prio.ts < snapshot.json
```

The snapshot is `{ "now", "ranked", "open", "tasks" }` (`now` and `open` are
optional). It reads only standard input and needs no token.
