# @halonicjs/tooling-paperclip

Tools that run beside Paperclip, the control plane our agents work in,
without a model: the Agent tools plugin with its PR watcher and PR tools, the
reviewer path list that the watcher and the reviewer-routing check share, and
the merge queue's fill order (`queue.prio`).

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-paperclip` (the PR watcher's `tick`, `decide`, `discoverPulls` and its readers; the plugin's `manifest`, `runWatcher` and host adapter; the GitHub snapshot's reader and shape; `reviewerFor`, `isLiamPath` and the path lists; `queuePrio` and its weights)
- **Requirements:** `paperclip.pr-watcher-done`, `paperclip.pr-watcher-wake`, `paperclip.pr-watcher-read-only`, `paperclip.pr-watcher-plugin`, `paperclip.pr-tools`, `paperclip.agent-tools-metrics`, `paperclip.board-check-writes`, `paperclip.board-check-asks`, `paperclip.board-check-failed-runs`, `paperclip.board-check-waiting`, `paperclip.board-tools`, `paperclip.github-snapshot`, `paperclip.github-snapshot-store`, `paperclip.reviewer-paths`, `paperclip.queue-prio`, `paperclip.queue-state`

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
author that start with `PR watcher:`. What it reported lives in those
comments; the only state it keeps is the pass's GitHub snapshot (below).

A pass takes about a minute, so right before it comments or marks a task
done, the watcher reads the task again. If its author closed it in the
meantime, the watcher leaves it alone and logs that; it doesn't count as
a failure.

It reads GitHub through the snapshot (below): GraphQL queries and a few GET
requests, only to `api.github.com`, about 20 calls per pass on `halonic`.

## The Agent tools plugin

`src/plugin/` holds the plugin: `manifest.ts`, `worker.ts` (the job),
`tools.ts` (the agent tools) and `host.ts`, the adapter to Paperclip's
plugin API. It asks for the fewest capabilities the watcher and the tools
need: jobs, reading companies, agents, tasks and comments, creating
comments, wake-ups, `issues.update`, outbound HTTP, reading a secret,
registering agent tools, writing metrics and keeping plugin state (the
GitHub snapshot). The board check adds events, the two documents, reading
approvals, a task's subtree, its blockers and its pending cards (see Board
check below). No webhooks, UI, files or processes.

- **Status changes:** the manifest can't narrow `issues.update`, so
  `host.ts` is the only file that changes a task's status, and its
  `doneOnly` refuses anything but `{ status: "done" }`. A test fails if
  another file calls `issues.update(`.
- **Outbound HTTP:** the manifest can't list allowed hosts, so the GitHub
  reader's origin guard keeps the token on `api.github.com`, and the
  GraphQL reader posts only to its `/graphql`, only a document that is a
  single `query`.
- **Plugin state:** one entry per company, the pass's GitHub snapshot: ids,
  states, names and times, no comment text.
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

Agent tools (HAL-15920, B1) that replace a handful of `gh` calls with
one. The first two read GitHub with GET requests only, through the same reader and
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
- **`queue_state()`** (Board Checker addendum on HAL-15997, for the Merger
  and the Fast-track Monitor): the merge queue in order, each entry's
  state, `ci-ok` on its group commit, minutes in the queue and who queued
  it; the merge-group jobs queued for a runner (each group commit counted
  once) and the longest wait; and every open pull request labelled
  `fast-track` with who added the label. An adder GitHub doesn't give (older
  than the 20 newest label events) is "unknown", which never counts as
  allowed. It reads the last snapshot from plugin state and sends no
  request; a snapshot older than 30 minutes is marked stale. Moves to the
  `merge-queue` plugin in phase 2.

## Board check

The Board Checker's checks as the `board-check` job, without a model
(phase 1b, HAL-16194; the Board Checker addendum on HAL-15997). It spots
board asks, keeps failed runs and lists the tasks waiting on the board;
team load, approvals and merge speed follow. Each job pass lists the open
tasks once and every part reads that one listing.

**Board asks.** An agent's comment from the last 12 minutes that matches
the Board Checker's pattern (`sv.cjs`: "for the board", "board's yes",
"needs the board", "card is up", …) is an ask. Not an ask: the board's own
comments, the plugin's (no agent author), the Board Checker's answers,
Paperclip's fast-response receipts, anything signed "Board check (plugin)"
and the Merger's requests on HAL-14388. Each new comment is looked at at
once (`issue.comment.created`); the job looks again every 10 minutes at the
open tasks active in the last 12 minutes, since events can be lost or come
twice. New asks update the `board-asks` document on the Board Checker's
task (task, comment id, author, time, link; never the comment's text) and
wake the Board Checker once per batch. Asks are remembered by comment id
for 7 days in plugin state, so a repeated event wakes nobody. Asks found
while writes are off are remembered too: turning writes on doesn't replay
them, it only wakes the Board Checker for asks from then on.

**Waiting on the board (part b).** On the first pass of each hour it lists
every open task blocked with a board user as assignee or unblock owner, or
in review with a board user as assignee or a pending board card. Each is
ranked by the open tasks it holds up, directly and through the chain of
blocker links (at most 300 link reads a pass; past that a count reads
"4+"), longest waiting first on a tie. The list names identifiers, holders,
counts and times, never titles, and updates the `board-waiting` document
only when it would read differently from the last one actually sent. Unlike
asks, it catches up: the first hour after the board turns writes on writes
the current list.

**Failed runs (part a).** Each `agent.run.failed` event is kept for 48
hours as ids, a time and a cause code: `no_identity`, `spend_limit`,
`timeout`, `adapter_error` or `other`. The error text is read once to pick
the code and dropped. The SDK can't list runs and events sent while the
plugin is down are lost, so the record says since when it counts. Each pass
wakes the task of a run without a GitHub identity, once per task, with the
wakes the ceiling leaves after a board ask's; the rest wait for the next
pass. New spend-limit failures get one line on the Seat Supervisor's task
(setting `seatSupervisorTask`).

**Tools.** `board_asks(since?)` lists the asks since an ISO time (24 hours
by default) with their links and whether the board or the Board Checker has
commented on the task since. `board_waiting()` gives the last hourly list
and its time. `failed_runs(since?)` gives each agent's
failed runs with tasks and cause codes, and since when it counts. None
carries comment or error text, and none costs a GitHub request.

**What it may write** (Liam's conditions, HAL-16192). Every write goes
through `src/board-check/writes.ts`, which only knows three calls:

- a comment on a task the settings name, ending with "Board check (plugin)",
  which is never a board decision;
- the `board-waiting` and `board-asks` documents on the Board Checker's task;
- a wake-up through Paperclip's wake call (`issues.wakeup`), never a
  reassignment or a status change.

A pass that plans anything else, or more than 5 wake-ups, 5 comments or 2
document updates, writes nothing and saves the metric
`board_check.gate_refused` (tag `reason`), which the HAL-16006 alert
watches. Writes, log lines, metrics and saved state carry ids, counts,
times and error codes only, never a comment's or an error's text.

**Settings** (board-only, like all plugin settings): `boardCheckerTask`,
the Board Checker's task id (empty: the board check doesn't run), and
`boardCheckWritesForVersion`, the no-writes switch. The board check writes
only while it equals the running plugin version, read again before each
write; otherwise it logs each write by kind, target and size. A new install
or an upgrade therefore starts with writes off.

**Metrics** (tags `companyId`, `trigger`: `event` or `job`):
`board_check.asks_new`, `.writes`, `.writes_logged`.

## Metrics

The numbers for the before/after comparison in the tools plan (HAL-15920).
Only counts, no task or pull request text; the host puts the plugin's id in
front of each name. A metric that doesn't save is logged and changes nothing.

- **Each pass, per company** (tags `companyId`, `dryRun`):
  `pr_watcher.tasks_with_pr`, `.done`, `.woken`, `.failed`,
  `.github_requests`, `.duration_ms`. In a dry run `done` and `woken` count
  what it would have done.
- **Monitors, each pass:** `monitors.set` (a Paperclip monitor due later on an
  open task), `monitors.fired` (one that fired in the last 10 minutes), and
  both again for tasks with a pull request (`*_on_pr_tasks`). Each fired
  monitor is one model run that only checks. A task closed since its monitor
  fired isn't open any more, so `fired` is a lower bound.
- **Each tool call** (tags `companyId`, `tool`, `outcome`): `tools.calls` and
  `tools.github_requests`.

## GitHub snapshot

`src/snapshot/` reads GitHub once per pass with GraphQL, in place of the
REST reads per pull request (the supervision plugins plan on HAL-15997,
change 5). Each `pr-watch` pass takes it first, saves it in plugin state
(one entry per company, replaced whole), then finds and decides every task
from it. A failed save is logged and the pass still decides; a failed read
fails the company's pass, with no partial view.

- **What it reads, per repository:** the default branch's merge queue (with
  the first page only, and each group commit's checks: `ci-ok`, and the jobs
  queued for a runner; a job waiting on another job has no check run yet),
  every
  open pull request (25 per call, with its labels and who added them, `ci-ok`
  and the draft `ci-ok` on its head, mergeable, in the queue, reviews and the
  100 newest conversation comments), then closed ones (100 per call) until
  they are older than 3 days. `ci-ok` on a merge commit is read only for the
  merged pull requests a decision needs, 20 commits per call. On `halonic`
  on 22 Nov: 18 calls and about 45 points of the 5,000-an-hour limit, against
  some 450 REST requests per pass. Its facts matched the REST reader's on all
  40 open pull requests.
- **Read-only:** `gitHubQueryReader` posts only to
  `https://api.github.com/graphql`, and refuses any document that isn't a
  single `query` before sending it.
- **What it keeps:** ids, states, names and times. Comment and review text is
  read to find findings and signed approvals, then dropped.

**The stored shape is a contract** (`src/snapshot/shape.ts`): `queue_state`
and `merge_speed` (HAL-16194) read it from plugin state. Adding a field is
fine, as an optional field, since readers still meet a snapshot saved before
it; renaming or removing one bumps `snapshotVersion`, and readers refuse a
version they don't know. Each pass replaces the whole snapshot.

| Field | What it holds |
| --- | --- |
| `version`, `takenAt`, `closedWindowDays` | shape version, when the pass read it, how far back closed pull requests go |
| `repos[].repo`, `.defaultBranch` | `owner/name`, its default branch |
| `repos[].queue[]` | `number`, `position`, `state`, `enqueuedAt`, `enqueuedBy`, `groupHead`, `estimatedSeconds`, `solo`; added later, so possibly absent: `groupCiOk` (null before the group forms), `jobsWaiting`, `waitingSince` (when the longest-waiting job was queued) |
| `repos[].pulls[]` | `number`, `url`, `state` (`open`, `merged`, `closed`), `branch`, `headRepo` (a fork when it isn't `repo`), `base`, `head`, `updatedAt`, `mergedAt`, `mergeCommit` |
| `repos[].pulls[].open` | null when closed; else `draft`, `mergeable` (`yes`, `no`, `unknown`), `ciOk`, `draftCiOk`, `inQueue`, `labels[]` (`name`, `addedBy`, `addedAt`), `finding` (`id`, `at`), `approvals[]` (`by`, `head`) |

## Leaving a task the watcher watches

Paperclip wakes an agent again ("disposition repair") when a run ends with
its task open and no wait path it knows: a blocker, a monitor due later, a
pending interaction, a human assignee. The watcher isn't one of them. So an
author who waits on CI, the merge queue or a merge on their own task leaves
it `in_progress` with **one** slow monitor, about 4 hours out, at most 3
checks. The watcher's wake or done replaces the 20-minute CI checks and the
60-minute merge checks; the monitor fires only if the watcher missed
something. Waiting for review doesn't change: the task goes to the reviewer
with status `todo`.

`blocked` doesn't work for this: a blocker must be a task, and a pull
request isn't one; Paperclip refuses the plugin's wake while a blocker is
open, so it would need `issue.relations.write` to clear it first; and
`blocked` without a blocker wakes its unblock owner at once. The team's
monitor rule changes only once the board has installed the plugin and
turned dry run off.

## The AI seats plugin

`src/seats/` is the `seats` plugin (HAL-16008): it reads each AI seat's
usage limits, keeps the history the seat forecast needs and proposes moves.
It is its own plugin, `halonic.seats`, so the board installs, stops and
trusts it apart from Agent tools. So far it has its settings, its tables,
two board-only routes, the `seats.read` and `seats.history` jobs and the
`seat_usage` tool; the page comes next.

- **Settings** (board-only, empty by default): the seats in reading order,
  each with an id, a role (`pool`, `reserve` or `paid-api`), its Claude
  folder on the server, the account it should be signed in with, the id of
  its Claude connection in Paperclip and its manual reset group. The folder,
  account and connection id are sign-in details: nothing
  the plugin logs, stores or shows carries them. **Move agents** is off:
  the plugin then only proposes moves.
- **Tables** in the schema Paperclip gives the plugin
  (`plugin_seats_2a33967373`): `seat`, `reading`, `placement`, `event`,
  `agent_usage` and `agent_activity`, as `src/seats/records.ts` describes
  them. Paperclip runs `src/seats/plugin/migrations/` before the worker
  starts and refuses `DROP` and `DELETE` there, so a change adds a file.
- **Routes**, board users only (the worker checks again), under
  `/api/plugins/<plugin id>/api/`: `GET /seats` lists the seats with their
  id, role and reset group only, and `POST /seats/:seatId/manual-reset`
  records a manual reset by the board user.
- **`seats.read`**, every minute: reads each seat that is due, at its own
  minute in every 10 minutes, with `claude auth status --json` and, only for
  a subscription on the seat's own account, `claude -p /usage`. No shell, a
  time limit per call, and only `PATH`, `HOME` and the seat's folder reach
  the program. A rate limit backs the seat off to 20, 40 and at most 60
  minutes. Each reading is stored; rows past the forecast's retention
  (`retentionDays`) go at most once an hour. One company's settings hold
  the seats: if several list some, only the first is read and the job logs
  it. The back-off and alerts live in the worker's memory, so they start
  fresh when it restarts; `GET /seats` says when that was and shows each
  seat's next read, reading age, last error and alerts.
- **`seats.history`**, every 10 minutes, for the same company: reads
  Paperclip's `agents`, `cost_events`, `heartbeat_runs` and `issues`. An
  agent is on the seat whose folder its environment names
  (`CLAUDE_CONFIG_DIR`), or else whose connection its settings name; each
  change starts or ends a placement. The last hour of cost rows is summed
  again into 10-minute buckets on the seat the agent was on, so a run that
  ends late still counts. For each agent on a seat it notes its running and
  queued runs, open tasks, run cap and model. The queries pick single
  fields out of the agents' settings, never the whole settings.
- **`seat_usage`**, an agent tool, read-only: each seat's id, role and
  reset group, how its newest read went (`ok`, `rate-limited`,
  `signed-out`, `no-reading` and so on), its newest stored windows with
  how many minutes old they are, and the alerts `seats.read` holds. It
  answers from the `reading` table and the reader's memory and never reads
  a seat itself, so a seat has one reader only. It answers only the agents
  listed in the board-only setting **Agents that may call seat_usage**
  (the Seat Supervisor and Chief, HAL-16192), which is empty by default.
  The database's error goes to the plugin's log, not to the agent.

Build it with `pnpm --filter @halonicjs/tooling-paperclip run
build:seats-plugin`. That writes `dist/seats/`: the bundles, the migrations
and the folder's own `package.json`, which the board installs from
(Settings → Plugins). It isn't installed, and no seat's sign-in moves into
it, until HAL-16015 is done.

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
