# @halonicjs/tooling-paperclip

Tools that run beside Paperclip, the control plane our agents work in,
without a model: the Agent tools plugin with its PR watcher and PR tools, the
reviewer path list that the watcher and the reviewer-routing check share, and
the merge queue's fill order (`queue.prio`).

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-paperclip` (the PR watcher's `tick`, `decide`, `discoverPulls` and its readers; the plugin's `manifest`, `runWatcher` and host adapter; the GitHub snapshot's reader and shape; `reviewerFor`, `isLiamPath` and the path lists; `queuePrio` and its weights)
- **Requirements:** `paperclip.pr-watcher-done`, `paperclip.pr-watcher-wake`, `paperclip.pr-watcher-conflict-files`, `paperclip.pr-watcher-wake-status`, `paperclip.pr-watcher-retargeted`, `paperclip.pr-watcher-monitor-postpone`, `paperclip.monitor-dedupe`, `paperclip.pr-watcher-read-only`, `paperclip.pr-watcher-stack-rebase`, `paperclip.branch-update-write-scope`, `paperclip.pr-watcher-plugin`, `paperclip.pr-watcher-review-priority`, `paperclip.pr-watcher-parent-block`, `paperclip.pr-tools`, `paperclip.ci-failures-tool`, `paperclip.task-tools`, `paperclip.agent-tools-metrics`, `paperclip.board-check-writes`, `paperclip.board-check-asks`, `paperclip.board-check-failed-runs`, `paperclip.board-check-piles`, `paperclip.board-check-waiting`, `paperclip.board-check-load`, `paperclip.board-check-approvals`, `paperclip.board-check-merge-speed`, `paperclip.board-tools`, `paperclip.merge-speed-tool`, `paperclip.github-snapshot`, `paperclip.github-snapshot-store`, `paperclip.github-routes`, `paperclip.agent-merge-counts`, `paperclip.reviewer-paths`, `paperclip.queue-prio`, `paperclip.queue-state`, `paperclip.gh-guard`, `paperclip.gh-guard-route`, `paperclip.ready-for-review`, `paperclip.ready-for-review-wake`, `paperclip.task-effort-rules`, `paperclip.task-effort-guard`, `paperclip.task-effort-writes`, `paperclip.handoff-limit`

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
when every branch found for the task names the agent that holds it. It also
reads tasks in `backlog` and `blocked`, where a stacked pull request's task
often waits, but only for a retargeted pull request (below): it never marks
them done, wakes them for anything else or hands them on, and moves one to
`todo` only if Paperclip won't wake it as it is (HAL-17869). When the
reviewer holds it, the branches name different agents, or the author already
has a run going, it does nothing and logs why.

| What it sees | What it does |
| --- | --- |
| Every pull request found for the task is closed, at least one merged, each merged one has `ci-ok` passed on its merge commit (the merge-group run) or is included in the base branch's newest green CI push run, the task has no child task that isn't done or cancelled, and the author hasn't held it (below) | Marks the task `done` and comments |
| `ci-ok` failed on an open pull request's own head | Comments and wakes the author |
| It conflicts with its base branch and isn't in the merge queue | Comments and wakes the author, naming the files both it and its base branch changed since it branched (at most 10; HAL-17922) |
| Its base changed to the default branch after it was last reopened or pushed to (a stacked pull request whose lower one merged), and it is neither a draft nor in the merge queue. GitHub never runs a ruleset's required workflow on a base change, so it stays blocked with green checks | Comments and wakes the author to close and reopen it or push |
| A review comment newer than the watcher's and the author's last comment on the task: a GitHub review that requests changes, an inline comment on the head, or a review or conversation comment with a `[blocker]`, `[major]` or `[minor]` finding or a "changes requested" verdict ("No changes requested" and approvals don't count), by the repository's owner, an organization member or a collaborator | Comments and wakes the author |
| On `cloud` only: an approving GitHub review on the head, by an organization member or collaborator other than the agents' shared account, and the pull request is out of draft. `cloud`'s `main` rule asks for such a review (the board's, so far), and nobody queues there (HAL-17730) | Comments and wakes the author to merge it, once per head; the review also counts as the approval, so the task isn't handed to a reviewer again |

Any open pull request keeps the task open, a stacked one included; one
closed without merging is ignored.

**Rebasing a stacked pull request** (HAL-18031, off until the board turns
`stackRebase` on and sets `branchUpdateToken`). Before it wakes the author
about a base change or a conflict, the watcher checks whether the pull
request is the child of a merged one: same repository, now on `main`, its
last base change came from a branch whose pull request GitHub says merged,
and its head still holds that pull request's last head. Then it asks GitHub
once per head to rebase it on `main` (`updatePullRequestBranch`, rebase
method). `main` takes squash merges, so the rebase replays the base's old
commits: GitHub drops the ones that come out empty and refuses when one
conflicts, as when a review fix rewrote an earlier commit's line (trial on
HAL-18035).

- GitHub takes it: no wake; a note on the task says so. CI runs on the new
  head, and an approval on the old head goes to its reviewer as rebase only
  once `ci-ok` is green (the approved side is compared from the base's last
  head, not from `main`).
- GitHub refuses: one wake, naming the files and the command that leaves out
  the base's old commits, `git rebase --onto origin/main <base head>`.
- The same head again: nothing, whatever came of it. Tried heads are kept in
  plugin state (`pr-watcher` / `stack-rebase`, the last 500).

The rebase uses the **branch credential**, not the read token: a GitHub App
the board creates with `Contents: write` on `halonic-com/halonic` only, no
workflows scope (a branch that changes `.github/workflows/` falls back to
the wake) and **no bypass** in the `main` ruleset. If it has to be a
fine-grained token instead, it expires within 90 days and is rotated before
then. The client (`src/branch-update/write-client.ts`) sends only that one
mutation, and only for an open pull request whose head branch is in the
same repository, still at the head the watcher read, and neither `main`,
protected nor under a ruleset, all read with the read token. The token is
resolved at each rebase and kept out of state, logs and errors.

**Handing a ready task to its reviewer** (HAL-17675). When the watcher has
nothing else to tell the author, every open pull request of the task is out
of draft, mergeable, without an open review finding, and green or approved on
its head, and at least one still needs an approval, the watcher comments
"PR watcher: ready for review: #N, head `abc1234`." and gives the task to its
reviewer with status `todo`. The reviewer is Julian when `reviewerFor` says
Julian for each of them (it reads the changed files, as `pr_status` does),
otherwise Liam; Liam's own pull requests go to Julian and Julian's to Liam.
Once per head: a task the reviewer gives back without a new push stays with
its author. When Julian's approval is the only one on the head and doesn't
count by the HAL-14809 rules (the queue gate refuses it as outside his
limits), the task goes to Liam on the same pass, once per head, saying why. It never hands over a task with an open child task. A security or
release pull request has a review task of its own; its author keeps the task
by ending their newest task comment with this line:

```text
PR watcher: own review task
```

**Pushing after an approval.** When an open pull request's newest approval
names an older head and nothing approves the current one, the watcher
comments once per approval on the task, "PR watcher: pushed after approval;
this voids the approval.", and wakes nobody. Not while it conflicts or is a
draft, and not when the watcher had reported a conflict or a base change on
the approved head: then the push was the fix. The token is read-only, so the
warning goes on the task, not on the pull request.

**Re-review after a push** (HAL-17759). When the watcher hands over a pull
request that was approved on an older head, it compares the pull request's
own changes at the approved head and at the current head on GitHub (3 GET
requests). Equal changes, line numbers aside, mean only a rebase: the comment
says so, and a pull request Liam approved goes to Julian with the line he
posts after his own `git range-diff` check (HAL-14809). Any other difference,
or a failed comparison, names both heads and goes to the reviewer of the
paths. A security pull request by its paths (a code path with one of the
reviewer path words, `docs/security/` or `SECURITY.md`) keeps its own gate:
it isn't compared, and goes to Liam with both heads named (HAL-17901). The
watcher never approves anything itself.

**Waiting for review** (HAL-17760). While the reviewer (Liam or Julian, not
the author) holds the task with no run going, the watcher reads its pull
requests too. When one is out of draft, not in the merge queue, green on its
head and not approved on it, and the watcher's "ready for review" comment for
that head is more than an hour old, it comments once per head on the task,
"PR watcher: waiting for review for over 1 h: #N, head `abc1234`, handed over
at <time>.", and wakes nobody. When a check the merge queue requires has no
run on that head (today `Guard notes`, the organisation's required workflow,
which GitHub runs only on some events), the note adds "; no `Guard notes` run
on this head". The pass summary and the metric
`pr_watcher.review_waits` count these notes, so Chief's team check can list
them.

**A limited reviewer's review moves at once** (HAL-19203). Before that note,
when the reviewer holding such a task is limited, the watcher gives the task
to the other reviewer (status `todo`) with "PR watcher: Liam is parked on a
pool wait since <time>, so this review goes to Julian now (HAL-19203):" and
one line per waiting pull request. A run of theirs that is only queued or
parked on the task doesn't stop the move, which cancels it; a working run
does. Julian takes it only when every waiting pull request is his by
`reviewerFor` and none is a security one, or Liam wrote them; Liam takes any
Julian holds but his own. When the other reviewer is limited too, the task
stays and gets one note per head, "PR watcher: both reviewers are limited
(…)", waking nobody. Each head moves to each reviewer at most once. The pass
summary and the metrics `pr_watcher.review_rerouted` and
`pr_watcher.review_both_limited` count both. A reviewer is limited when one of
their 20 newest runs is parked (`scheduled_retry`) on
`ai_connection_pool_wait` and nothing of theirs started since, or a run
stopped on `provider_limit_wait` or `provider_quota` less than 5 hours ago and
nothing of theirs started since. The plugin SDK's task reads don't show those
runs, so the watcher GETs `/api/companies/<id>/heartbeat-runs` with the task
effort handler's `paperclipApiUrl` and `paperclipApiKey`, once per reviewer
and pass and only when a reviewer holds a waiting task. Like the plugin's
other calls to Paperclip's API, the read uses Node's own `fetch`, not the
host's, with a 15 s timeout and redirects refused. Without those settings, or
when the read fails, nothing moves; a failed read logs "PR watcher: couldn't
read <agent>'s runs:" with a fixed code (`http_<status>`, `not_a_list` or the
error's name), never the answer's text.

**Longest wait first** (HAL-17920). In the same step, while such a head has
waited more than an hour since its "ready for review" comment, the watcher
raises the task's priority to `high` if it is `low` or `medium` when re-read
right before the write. It never sets `critical`, never lowers a priority and
changes no other field, so a person's choice stays. The pass summary and the
metric `pr_watcher.review_priority_raised` count these raises. The pass also
lists every handed-over head still waiting for its approval, whatever its age,
oldest handoff first, and logs the oldest five as one line, "PR watcher:
longest waiting for review: HAL-5702 #5702 4.0 h, HAL-5701 #5701 1.5 h.", for
Chief's team check.

A wake comment also carries, for each open pull request it names, the head
lines `pr_status` would give, from the same pass: the head, `ci-ok` on it
(with up to five failing checks by name when it failed), mergeable, the merge
queue and the signed approvals. The author doesn't need to read GitHub again
unless they pushed since. The pass reads no changed files, so Julian's
approval shows as counting only within his limits; `pr_status` checks them.

**More PRs to come.** A task that delivers several pull requests one after
another would otherwise be closed after its first merge. The simplest way to
keep it open is to open the next pull request, a draft is fine, before the
first one merges. Otherwise, after the merge, put this line in a task comment:

```text
PR watcher: more PRs to come
```

The watcher reads only your newest comment on the task: the hold lasts until
you comment again without the line. A hold line written before the last merge
doesn't count (HAL-17692): HAL-17445 had it under every comment, so its merged
task, and the task it blocked, stayed open for 4 hours.

**Unblocking.** After the tick, the watcher sweeps every `blocked` task an
agent holds with no run going. When everything in its "blocked by" is done or
cancelled, it sets the task to `todo`, comments which tasks it waited on and
wakes the agent, once per set of blockers. A blocked task with nothing in
"blocked by" waits on a person or the board, so it stays blocked. This belongs
in Paperclip itself, when a blocker closes; until then the sweep also catches
blockers that someone else closed, within 10 minutes.

**Parent blocks.** A task blocked by its own parent, or by a task above it,
waits forever: the parent can't finish before its child (`parent_block`). The
same sweep removes such a link when that blocker is unfinished, comments why,
and, when nothing else unfinished holds the task, sets it to `todo` and wakes
the agent. It re-reads the task, its blockers and its parents right before the
write, and removes no other blocker. In a dry run it only logs.

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
comments, creating a chief-line thread (`issues.create`, only in
`chief-line.ts`), wake-ups, `issues.update`, outbound HTTP, reading a secret,
registering agent tools, writing metrics and keeping plugin state (the
GitHub snapshot). The board check adds events, the two documents, reading
approvals, a task's subtree, its blockers and its pending cards (see Board
check below). The gh guard adds one route that agents' runs call (see gh guard
below). The watcher also asks for `issues.monitors.postpone`, a capability of
our local server patch (HAL-16413), to move a watched task's fallback monitor
later (see Leaving a task the watcher watches). The Worker agents page adds a UI
page and a read of Paperclip's own tables (see Worker agents page below). No
webhooks, files or processes.

- **Status changes:** the manifest can't narrow `issues.update`, so
  `host.ts` is the only file that changes a task's status: its
  `doneOnly` refuses anything but `{ status: "done" }`, and its
  `handoffOnly` anything but one agent as assignee with `{ status: "todo" }`,
  and its `highOnly` anything but `{ priority: "high" }`.
  A test fails if another file calls `issues.update(`.
- **Outbound HTTP:** the manifest can't list allowed hosts, so the GitHub
  reader's origin guard keeps the token on `api.github.com`, and the
  GraphQL reader posts only to its `/graphql`, only a document that is a
  single `query`.
- **Plugin state:** one entry per company, the pass's GitHub snapshot: ids,
  states, names and times, no comment text.
- **Settings per company:** `githubToken` (the secret
  `PR_WATCHER_GITHUB_TOKEN`, a read-only fine-grained token), `repos`
  (default `halonic-com/halonic` and `halonic-com/cloud`; tools without a
  `repo` answer for the first) and `dryRun`. A repository after the first
  that the token doesn't reach is left out of the pass with a logged error,
  so the others are still watched. **Dry run is on unless it is
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

writes `dist/worker.js` (the SDK bundled in, with our patch
`patches/@paperclipai__plugin-sdk@2026.1117.0.patch`, which adds
`ctx.issues.monitors.postpone`), `dist/manifest.js` and the page's
`dist/ui/index.js`, which
`package.json`'s `paperclipPlugin` block names, and the Merger's rules file
`dist/merge-control-decide-<version>-<hash>.js` (see Merge control). The board installs it from
that folder of a `main` checkout on Halonic Server (Settings → Plugins);
publishing it to npm would be a release. Run it in dry run first, read the
job log, then turn `dryRun` off.

## Worker agents page

The board's read-only "Worker agents" page (HAL-16249, addendum 2 on
HAL-15997): the board agents with their newest run, then one row per worker
agent (Pip left out) with its task in progress, its newest run and its failed
runs of the last 24 hours by cause code, and its 5 rule checks (HAL-16250),
worst first. Open PRs say "Not available yet" until HAL-16251.

- **Board-only:** the data comes through the `worker-agents` route, declared
  `auth: "board"` and checked again in `src/plugin/worker-agents-route.ts`, and
  the page's data key, which Paperclip answers only for board users. No agent
  tool, so MCP never sees it. The page's code only reads (a test checks it).
- **The read:** `src/worker-agents/tables.ts` reads `heartbeat_runs` and
  `issues` (the manifest's `coreReadTables`) with named columns only. It never
  reads `agents`, whose rows hold adapter settings that can carry keys: the
  agent ids come from the SDK's `ctx.agents.list`. A
  failed run's cause code is worked out in the database with the board check's
  patterns, so a run's error text, logs and output, and a task's title, never
  reach the plugin. Paperclip requires `database.namespace.migrate` and
  `database.namespace.read` for this read; `src/plugin/migrations/` is empty,
  because the plugin keeps nothing in its own schema.
- **Rule checks:** every `board-check` job pass works them out in
  `src/worker-agents/rule-checks.ts` from its listing of open tasks and the
  PR watcher's snapshot, and saves them in plugin state (`rule-checks`); the
  page only reads that entry. They are: new work on a red PR (Check at most,
  a guess from timestamps), task state (nothing set to wake, HAL-15308 R2),
  monitors (two tasks on one PR, or one firing more often than every
  15 minutes), workload (nothing to start, or more than 10 in progress) and
  branch names (`<agent>/HAL-<n>-<words>`). A monitor's notes give only
  pull request numbers; nothing an agent wrote is kept. The part writes
  nothing in Paperclip.
- **Privacy:** task keys can name an open security finding, so the page is
  never exported, linked publicly or pushed out.

## PR tools

Agent tools (HAL-15920, B1) that replace a handful of `gh` calls with
one. `pr_status`, `ci_failures` and `rebase_pr` read GitHub with GET requests only, through the same reader and
token as the watcher, and give up after 10 s (each request after 8 s),
inside the about 15 s the tool bridge gives a call.

- **`pr_status(pr, repo?)`**: one pull request by number or URL, on one of
  the plugin's `repos` (the first by default). It answers with the state,
  `ci-ok` on the head (the light run's `ci-ok (draft, light run)` while
  it's a draft), mergeable, commits behind its base, the merge queue, the
  reviewer by the path rules, the newest review finding on the head, and
  each signed approval ("Julian: approved on head `abc1234`") with whether
  it counts by the HAL-14809 rules, then what the author does next. The
  author says whether a pull request is a security or release one; the
  tool can't tell, so a counting approval from Julian carries that note.
  Each approval also says `copy: yes | no | unknown`: whether the
  reviewer's own Paperclip agent posted the same line with the full
  40-character head on the task the branch names (`<agent>/HAL-<n>-…`;
  `unknown` for any other branch). Detection only: the copy never changes
  whether it counts (HAL-19324). The PR watcher's wake lines show the same.
  About 10 requests, plus 2 Paperclip reads.
- **`ci_failures(pr | sha, repo?)`** (HAL-18982, token plan Track B on
  HAL-18938): why CI is red, instead of `gh run view --log` and `gh api`
  log reads. For a pull request's head or a full commit sha it lists the
  failed jobs (the newest run of each check that ended `failure`,
  `timed_out` or `startup_failure`; not cancelled or skipped ones, and not
  `ci-ok`, which only repeats them), each with its link, its error
  annotations (failing test, file, line, the message's last 8 lines; 10 per
  job) and its summary's last 12 lines. At most 8 jobs; every line of
  GitHub text is cut at 300 characters and JSON-quoted, and the answer at
  8,000 characters. A private repository's answer has job names and links
  only. It doesn't read raw job logs: GitHub serves them through a
  redirect to another host, which the reader refuses so the token stays
  on api.github.com, and they need the Actions read permission. About 3
  requests, plus one per failed job.
- **`rebase_pr(pr, repo?)`** (HAL-18984, token plan Track B on HAL-18938):
  whether the calling agent's own pull request (its branch starts with the
  agent's url key, in the same repository) needs a rebase on its base and
  can get one: `rebase` when it's open, not queued, mergeable and behind;
  `up-to-date` when it's level; otherwise `refused`, with the reason. It
  names the approvals on the head and whether they carry over the rebase
  (the Merger's carry-over: not for a security pull request by its paths, a
  release one, Liam's own or a stacked one whose base isn't `main`), and warns that an approved pull request is
  rebased only for a conflict or when the queue asks. It reads as
  `pr_status` does and sends no write: GitHub's rebase waits for the board's
  decision on the branch credential (HAL-18091), so for a `rebase` or a
  conflict it gives the commands to run in the agent's clone, only for
  branch names of letters, digits and `._/-`.
- `my_prs()` moved to the workspace plugin (workspace-company, HAL-17968);
  the gh guard still points `gh pr list` and `gh pr status` to it there.
- **`write_pr(branch, title?, body?, state?, labels?)`** (HAL-18983, token
  plan Track B on HAL-18938): opens or updates the calling agent's own pull
  request on halonic-com/halonic in one call, instead of `gh pr create`,
  `gh pr edit` and `gh pr ready`. With no open pull request on the branch it
  opens one against `main` (a draft unless `state` is `ready`; title and
  body needed), adds `built-on:paperclip` and a `Built-on: paperclip` line;
  otherwise it changes only what the call names. Labels are only the
  built-on ones: `fast-track` and the queue's labels stay with the board and
  the queue session. `set_next_step` and `finish_run` take `readyPr` to mark
  the pull request ready first, so one closing call does comment, state,
  ready and handoff. Writes go only through `src/pr-write/write-client.ts`
  with the **PR write token** (`prWriteToken`: a GitHub App with Pull
  requests write on halonic-com/halonic only, the board's OK of 26 Nov),
  which can't push, merge, approve, queue or close. Without the token set
  it answers with the `gh` command to run. A pull request it opens has the
  App as its author, which the fast-track rules treat as a bot: open a
  fast-track candidate with `gh` instead.
- **`queue_state()`** (Board Checker addendum on HAL-15997, for the Merger
  and the Fast-track Monitor): the merge queue in order, each entry's
  state, `ci-ok` on its group commit, minutes in the queue and who queued
  it; the merge-group jobs queued for a runner (each group commit counted
  once) and the longest wait; and every open pull request labelled
  `fast-track` with who added the label last (a label removed and added
  again names the second adder). An adder GitHub doesn't give (older
  than the 20 newest label events) is "unknown", which never counts as
  allowed. It reads the last snapshot from plugin state and sends no
  request; a snapshot older than 30 minutes is marked stale. Moves to the
  `merge-queue` plugin in phase 2.
- **`ready_for_review(branch, sha?)`** or **`ready_for_review(checkId)`**
  (L5b, HAL-16437): asks the precheck service (L5a, `precheck/` in
  halonic-com/server) to check a pushed branch merged into current `main`
  before the agent opens or updates its pull request. A check takes 1 to 5
  minutes and an agent's tool call ends after about 10 s, so the tool starts
  it with `wait: false`, reads it every 2 s for about 6 s, and otherwise
  answers `RUNNING` with the check's id for the next call. `PASS` lets the agent go
  on, `FAIL` names the failed steps with the service's short log summary. A
  queue that's full (`429`), a service that's down or answers oddly gives
  `CHECK UNAVAILABLE`, which never blocks: the agent goes on and CI decides.
  Input the service refuses (`400`) and an unknown id are errors. It calls
  the service with Node's own `fetch`, because the host's guard may refuse a
  private address; setting `precheckUrl` (empty:
  `http://halonic-precheck:8787`) is the only address it calls.
- **Wake when the check is done** (HAL-18980): when the branch is named
  `<agent>/HAL-<n>-<words>` and the calling agent holds HAL-<n>, a `RUNNING`
  answer says the plugin wakes that task, and the plugin keeps the check in
  its state. Another call for the same check (its id, or the same branch and
  commit) gives the same answer without a request. The `precheck-wake` job
  reads each kept check every minute; once it is done, or still running after
  30 minutes (then `CHECK UNAVAILABLE`), it posts the answer on the task and
  wakes it once, only if the same agent still holds it. Once the answer is
  posted the check is dropped, even if the wake fails; a check whose answer
  can't be posted is dropped after 60 minutes. A new check of the
  same branch replaces the kept one. Other branches keep the old answer:
  `RUNNING` with the id for the next call.

## Task tools

Agent tools (HAL-16403, B2 in the tools plan on HAL-15920) that replace a
chain of curl requests to Paperclip's API with one call. They go through
the plugin host, so they need no key and send nothing to GitHub.

- `task_get(task, comments?, document?)` moved to the workspace plugin
  (workspace-company, HAL-17968).
- **`comment(task, body)`**: posts one comment, at most 20,000 characters,
  with the calling agent as its author (from the run's context, never from
  the parameters). A plugin's comment wakes nobody, not even the task's
  holder, so the answer says to assign the task to hand it on.

`comment` doesn't change a task's status, holder or monitor. These two do, each with
a comment in the same change:

- **`set_next_step(task, status, comment, monitor?, blockedBy?)`**: keeps
  the task with the calling agent: `in_progress` with a monitor
  (`{ inMinutes, ref, service?, maxChecks? }`, 15 to 1,440 minutes, 1 to 8
  checks, 4 by default), or `blocked` by 1 to 10 tasks. It refuses any
  handoff.
- **`finish_run(task, outcome, comment, to?, blockedBy?)`**: `done`,
  `handoff` to another agent by name or url key (status `todo`, which wakes
  them), or `blocked`. A handoff or a block clears the task's monitor.
  Paperclip stops the calling run as the task changes hands, so it is the
  run's last call.

Both send the change through the host method `issues.setDisposition`
(capability `issues.disposition.write`, the local server patch from
halonic-com/server#31 and #32). It makes the change through Paperclip's
own `PATCH /api/issues/:id` as the calling agent's run, on the task that
run holds, so the disposition guard, the wakes, the monitor rules and the
answers are the route's own (Liam's decision B on HAL-16988). A refusal
comes back with the route's status, code and message.

## Messenger reactions

Paperclip's comments have no reactions, so the plugin keeps them
(HAL-19139, the board's yes on 26 Nov) in its own state, per task
(namespace `reactions`, key `comments`), until Paperclip has native ones.
A reaction is never a comment: it wakes nobody and never counts as unread.
The emoji are 👍 ❤️ 😂 😮 ✅ 👀. Requirements
`paperclip.messenger-reactions-store` and `paperclip.agent-react-tool`.

- **`GET /api/plugins/halonic.agent-tools/api/reactions/{taskId}?companyId=`**,
  board only: `{ reactions }` by comment id, each `{ emoji, by: { kind, id }, at }`.
- **`POST …/reactions/{taskId}?companyId=`** with `{ commentId, emoji, on }`,
  board only: adds or removes the signed-in person's own reaction on a
  comment of that task, and answers `{ commentId, reactions }`.
- **`react(task, comment, emoji)`**, the agents' tool: 👍 (on it, or done)
  or 👀 (seen, will come back) on a person's message, usually the one that
  woke the run (`originCommentIds` in the wake). It refuses an agent's
  message and any other emoji, and a new reaction replaces the agent's last
  one on that message. A question still gets a written answer.

## Trial results

**`trial_results(action, …)`** (HAL-17280, option (b) of HAL-17267) lets
the agents in the setting `trialResultsAgents` (Tomas, Elena and Liam by
default) read model-trial results without asking the board. Agents get no
key and no database access: the plugin calls the read-only results service
(`results-api/` in halonic-com/model-trials) with `GET` only, and the
service decides what a caller sees (scores and aggregates by default,
invalid runs left out; prompt and diff only for one lab run, capped and
scrubbed; scores only for live-shadow runs).

- `action` is `variants`, `summary`, `paired`, `runs` or `run`, mapped to
  `/v1/<action>` (`/v1/run/<run_id>` for `run`). `variant`, `ref`,
  `batch`, `stage`, `set`, `task` and `limit` go on as query parameters as
  they came; the service checks them and answers 400 for one it doesn't
  take. `include` goes on only for `run`.
- The token is the secret in `trialResultsTokenRef` (`TRIAL_RESULTS_TOKEN`),
  read at call time and sent only in the `Authorization` header; any copy
  of it in the service's answer or an error is replaced before the agent or
  the log sees it. Without it the tool answers that it is off.
- `trialResultsUrl` (empty: `http://trial-results:8095`, on Paperclip's
  Docker network) is the only address it calls, with Node's own `fetch`,
  like `ready_for_review`. A request gives up after 8 s.
- The answer is the service's JSON, marked as data and cut to 20,000
  characters. 400 and 404 come back with the service's reason; 401 or 403
  and other failures say to tell the board, and are logged with their
  status only.
- `action: "findings"` (HAL-17317) reads the service's latest summaries,
  `/v1/findings?kind=<kind>`, with `kind` one of `live_daily`,
  `lab_decisions`, `seat_calibration`, `seat_burn`, `learnings`, `seat_lane`
  or `all` (the default); no other parameter goes on. It has its own reader
  list, `trialFindingsAgents` (Tomas, Elena, Liam, Chief and Seat Supervisor
  by default), so Chief and Seat Supervisor get the summaries but no run
  data: every other action stays limited to `trialResultsAgents`. Its
  answer is cut at 120,000 characters, since `all` runs to about 100 KB.

## gh guard

Agents read a pull request's status with `gh` about 3,700 times a day, where
`pr_status` and `my_prs` answer in one call (HAL-16401, lever L1b on
HAL-15920). The guard answers those reads with the tool call instead.

**Where it runs.** A plugin can't add hooks, files or `PATH` entries to an
agent's run, and an agent's folder is a plain folder holding the clone, so a
hook in this repo would never load. Paperclip's GitHub launcher runs the
first `gh` on `PATH` after its own folder, so the guard is a `gh` wrapper
installed ahead of the real one, at `/usr/local/bin/gh`. It sees `gh`'s own
arguments, not a shell line, and works for every adapter and folder.

**What it answers.** In an agent's run (`PAPERCLIP_AGENT_ID` set), on
`halonic-com/halonic` (by `-R`, a pull request URL, `GH_REPO` or the
folder's remote, as `gh` picks it):

| Call | Answered with |
| --- | --- |
| `gh pr view`, `gh pr checks` | `pr_status({"pr": <n>})` |
| `gh pr list` (open), `gh pr status` | `my_prs()` |
| `gh run view`, `gh run list` | `pr_status`, for `ci-ok` on the head |

`gh` still runs for what no tool answers: `pr view --comments`, `--json`
with a field `pr_status` doesn't give (body, files, comments, reviews,
labels), `run view --log` or `--log-failed`, a run's jobs and steps
(`run view --json`, `--job` or `--verbose`), `run list --workflow`, a list
that is filtered (`--search`, `--head`, `--label`, `--base`, `--assignee`,
`--app`) or not of open pull requests, `--web`, `--help`, every other
command and every other repository. The message names the call, how to load
it in Claude Code (ToolSearch), and the `gh` reads that stay.

**Who decides.** For each read it would answer, the wrapper asks the
plugin's route `POST /api/plugins/halonic.agent-tools/api/gh-guard` with the
run's own Paperclip key. The plugin counts it and answers whether to
redirect: only while the board's setting **Redirect gh status calls** is on
and the agent isn't in **Agents the gh guard lets through** (for one that
needs `gh`'s own answer, such as for the merge queue). It is off by default,
so a new install only counts. If the plugin doesn't answer within 1.5 s,
refuses, or is an older version without the route, `gh` runs.

**Metric** (tags `companyId`, `subcommand`, `agent`, `mode`):
`tools.gh_redirected`, one per read the wrapper asked about. `mode` is
`redirected`, `dry-run` (the setting is off) or `exempt`; set the
`redirected` ones against `tools.calls`.

**Installing it** (the board, on Halonic Server): build it from a `main`
checkout with `pnpm --filter @halonicjs/tooling-paperclip run build:gh-guard`,
which writes `dist/gh-guard/gh` (one file, Node only, executable). Copy it
next to the compose file and mount it over the runner's `PATH`:

```yaml
    volumes:
      - ./agent-host/gh-guard/gh:/usr/local/bin/gh:ro
```

Recreate the container. Check it in an agent run: `which -a gh` lists the
launcher, `/usr/local/bin/gh`, then `/usr/bin/gh`, and `gh pr checks <n>` on
`halonic` still runs while the setting is off; the plugin page's metrics
show `tools.gh_redirected` with `mode: dry-run`.

**Before you turn the setting on**, check that the tools the guard points
to answer: in an agent run, call `my_prs()` and `pr_status` for an open pull
request on `halonic`. Each must return its status, not an error. If either
fails (for example an MCP schema error such as "structuredContent: expected
record, received null", seen on 22 Nov), leave the setting off and fix the
Agent tools first: while it is on, the guard would stop `gh` and point
agents to a tool that doesn't answer. Then turn the setting on, and if the
tools stop answering later, turn it off again.
To roll back, remove the volume line and recreate the container.

## Board check

The Board Checker's checks as the `board-check` job, without a model
(phase 1b, HAL-16194; the Board Checker addendum on HAL-15997). It spots
board asks, keeps failed runs, lists the tasks waiting on the board and
the team load, lists new approvals, follows merge speed and spots queued
run piles. Each job pass lists the open tasks once and every part reads
that one listing.

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
them, it only wakes the Board Checker for asks from then on. When the
setting `boardAskWakeTask` names a task (such as Chief's chat task), the
wake goes to that task instead, and its holder's own comments don't count
as asks either; the `board-asks` document stays on the Board Checker's
task (HAL-18857).

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

**Team load (part c).** The same hourly pass adds a section "For Chief" to
that document: agents with nothing to start (no `todo`, no `in_progress`
task without open blockers) and agents with more than 10 tasks in progress.
Pip is left out, as are paused agents and ones waiting for approval. When
either list differs from the last one sent, Chief's task (setting
`chiefTask`) gets one comment, so it also catches up once writes are on.

**Approvals (part d).** Each pass reads the pending approvals directly and
lists the ones that weren't pending at the last pass in one comment on the
Board Checker's task: id, kind, who asked and when, never the payload. It
never decides one. The first pass after an install only notes what is
pending.

**Merge speed (part e).** Each pass reads the PR watcher's GitHub snapshot
from plugin state, so it sends no GitHub request. Merges per hour come from
the snapshot's merged pull requests. A pull request gone from the queue
since the last pass is an exit: merged if the snapshot says so, dropped
otherwise (a failed merge group, a gate dequeue or a close). Exits are kept
a week, as pull request numbers, outcomes and minutes in the queue; exits
before the first pass are unknown, so the drop rate and time in queue fill
up over the first hours. On the first pass of each hour it compares the
last 6 hours with the figures it last reported and comments on the Board
Checker's task only when one moved clearly: merges per hour by at least 1
and by half, the drop rate by 20 points over at least 3 exits, or the
median time in queue by 15 minutes and by half. The first figures are only
kept, and a snapshot older than 30 minutes is skipped. A comment only
logged while writes are off doesn't count as reported, so the first hour
after writes are turned on catches up.

**Failed runs (part a).** Each `agent.run.failed` event is kept for 48
hours as ids, a time and a cause code: `no_identity`, `spend_limit`,
`timeout`, `adapter_error` or `other`. The error text is read once to pick
the code and dropped. The SDK can't list runs and events sent while the
plugin is down are lost, so the record says since when it counts. Each pass
wakes the task of a run without a GitHub identity, once per task, with the
wakes the ceiling leaves after a board ask's; the rest wait for the next
pass. New spend-limit failures get one line on the Seat Supervisor's task
(setting `seatSupervisorTask`).

**Queued run piles (part a).** On the first pass of each hour it reads,
through `issue.subtree.read`, the queued and running runs of each open task
the listing shows with an active run (at most 60 tasks a pass), and counts
each agent's queued runs. An agent with 5 or more gets one line on the
Board Checker's task, naming every pile and its count; it is named again
only after its queue dropped under 5. A line only logged while writes are
off doesn't count, so the pile is named once writes are on. `failed_runs`
adds the last count as one line.

**Tools.** `board_asks(since?)` lists the asks since an ISO time (24 hours
by default) with their links and whether the board or the Board Checker has
commented on the task since. `board_waiting()` gives the last hourly list
and its time. `failed_runs(since?)` gives each agent's
failed runs with tasks and cause codes, and since when it counts.
`merge_speed(hours?)` gives merges, merges per hour, the drop rate and the
merged ones' median and longest time in the queue for the last 6 hours or
the hours asked (1 to 168), marked stale when the snapshot is older than 30
minutes. None
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
the Board Checker's task id (empty: the board check doesn't run),
`boardAskWakeTask` (optional: where a board ask wakes, see above),
`chiefTask` and `seatSupervisorTask` (optional, for their one-line
comments), and
`boardCheckWritesForVersion`, the no-writes switch. The board check writes
only while it equals the running plugin version, read again before each
write; otherwise it logs each write by kind, target and size. A new install
or an upgrade therefore starts with writes off.

**Metrics** (tags `companyId`, `trigger`: `event` or `job`):
`board_check.asks_new`, `.writes`, `.writes_logged`, and
`board_check.job_passes` (1 per finished job pass, none for event passes),
which the server's missed-pass alert counts: an hour with fewer than 4
means board.check missed passes or failed (HAL-18857).

## Task effort

Sets the thinking effort of a task's runs from its tags (HAL-16876, steps 2
and 3 of the effort decision on HAL-16866), on every `issue.created` and
`issue.updated`.

**The table** (`src/task-effort/rules.ts`, the one place it lives). Tags are
task labels, in the triage step's words (HAL-16471):

| Tags | Effort |
| --- | --- |
| `opus-only`, or an opus-only area: `security`, `trust`, `sandbox`, `schema`, `secrets`, `sign-in`, `oauth`, `keychain` | `high` |
| `D4` or `D5` | `high` |
| `D1`–`D3`, and a reviewer sent it back | `high` |
| `D1`–`D3` | `low` |
| No difficulty tag and not opus-only | nothing: the agent's own setting applies |

It never sets `medium`, `xhigh` or `max`; security sign-offs and the A0
release review are set by hand. A task counts as sent back when it moves
from a reviewer (`effortReviewers`, Liam and Julian by default) to another
agent and the reviewer's newest comment on it isn't a signed approval
("approved on head"). It writes only on tasks assigned to an agent.

**How it writes.** The SDK's task update leaves out
`assigneeAdapterOverrides`, so the handler sends one `PATCH
/api/issues/<id>` to Paperclip's own API with the settings' key. It changes
only `adapterConfig.effort` and keeps every other override, such as the
Sonnet pilot's model. A task's effort is the handler's only while it is the
value the handler wrote; when the table stops saying anything, it takes its
own effort off again.

**The guard.** Core doesn't check who may set a task's effort. The handler
keeps what it wrote per task and reports every other change: a log line with
the task, the old and new effort and the actor type (an error when an agent
made it, which the team rule forbids, a warning otherwise) and the metric
`task_effort.foreign_change` (tags `actorType`, `direction`: `set`, `raised`,
`lowered` or `removed`). A task whose effort someone else set or changed is
theirs: the handler never writes on it again, so it never raises or lowers an
effort a person chose. A task that already had an effort before the handler
watched it is left alone too. The guard reports whether or not the switch is
on.

**Switching it on and off.** The board sets these in the plugin's settings:

1. `paperclipApiUrl`: Paperclip's API as the plugin reaches it, scheme, host
   and port only (for example `http://127.0.0.1:3100`).
2. `paperclipApiKey`: a secret holding an API key that may change tasks.
3. `taskEffortWritesForVersion`: the running plugin version, shown on the
   plugin page. This is the switch.

While the switch is empty or names another version, or the address or key is
missing, the handler only logs `Task effort: would set HAL-… to low (switch
off).` and saves `task_effort.logged`. To switch it off, empty
`taskEffortWritesForVersion`; it takes effect on the next event. An upgrade
switches it off until the board enters the new version. Switching it off
leaves the efforts it already set in place; to undo one, clear the task's
effort in the issue properties (the handler then leaves that task alone).

**Metrics** (tag `companyId`): `task_effort.set` and `task_effort.logged`
(tag `effort`), `task_effort.failed` (tag `reason`, such as `http_403`),
`task_effort.foreign_change`. Log lines and metrics carry task identifiers,
effort words (anything else shows as `other`) and actor types, never task
text or the key.

## Hand-off limit

Keeps K3 from the phase 2 card (HAL-17628): an agent may pass a channel's
child task on at most 3 times. A channel is a parent task tagged `channel`
(the Paperclip provider sets the tag); it gets one child task per agent a
message goes to. On every `issue.created` and `issue.updated` of a task under
such a parent, the handler counts each change from one agent to another that
an agent made. Paperclip has no hook that refuses an assignment, so on the
fourth it assigns the task back to the agent who held it before and comments
"Stopped after 3 hand-offs". A change by the board or another person, the
system or a plugin is never counted, and neither is a change to or from no
agent. The count lives in the plugin's state, per task (`handoffs` namespace).
It needs no setting: tasks outside a channel are never touched.

**Metrics** (tag `companyId`): `handoff_limit.reverted`. Log lines name the
task's identifier, never task text.

## Difficulty tagger

Writes the difficulty labels the task effort handler reads (HAL-16901). When
a task is created, or its title or description changes, it sends the title
and the first 4,000 characters of the description to `claude-haiku-5-5`
(low effort, `max_tokens` 400) with the board's tagger prompt (the
`difficulty-labels` document on HAL-16876, kept in
`src/difficulty-tagger/prompt.ts`). The answer is JSON with `kind`,
`difficulty` and `opus_only`.

**The labels.** A code task gets `D1`–`D4`, plus `opus-only` when the answer
says so. Other work (review, docs, research, ops, other) gets none. The
tagger keeps every other label. It owns a task's difficulty labels only
while they are exactly the ones it wrote last, or the task has none and it
never wrote any: a `D1`–`D5` or `opus-only` label a person or Chief added,
or one of its own that someone took off, makes the task theirs, and the
tagger never calls Haiku for it or writes its labels again. A change that
leaves the title and description as they were costs no call.

**The key.** `taggerAnthropicKey` is a secret reference, bound to the
company secret `TAGGER_ANTHROPIC_API_KEY`. The tagger resolves it at call
time, sends it only to `api.anthropic.com/v1/messages`, and never logs or
keeps it. It reads the company's label ids from Paperclip's API with the
task effort handler's `paperclipApiUrl` and `paperclipApiKey` (the plugin
SDK has no label reads) and writes the labels through the SDK.

**Spend guard.** It adds up each call's cost from the answer's token counts
(at $0.10 and $0.50 per million input and output tokens, Haiku 5.5's list
price) per calendar month (UTC). Once
the month passes $5 it makes no more calls; it logs one error on the plugin
page ("Difficulty tagger: stopped for 2026-11 …") and saves
`difficulty_tagger.stopped`. It starts again on the 1st.

**Switching it on and off.** It is off by default and then calls nothing.
The board sets, in the plugin's settings:

1. `taggerAnthropicKey`: bind it to `TAGGER_ANTHROPIC_API_KEY`.
2. `paperclipApiUrl` and `paperclipApiKey`, as for the task effort handler.
3. `difficultyTaggerForVersion`: the running plugin version, shown on the
   plugin page. This is the switch.

To switch it off, empty `difficultyTaggerForVersion`; it takes effect on the
next event. An upgrade switches it off until the board enters the new
version. Labels it already wrote stay; remove one by hand and the tagger
leaves that task alone.

**Metrics** (tag `companyId`): `difficulty_tagger.labelled` (tag `labels`),
`difficulty_tagger.spend_micro_usd`, `difficulty_tagger.failed` (tag
`reason`, such as `http_401`, `missing_label` or `unreadable_answer`) and
`difficulty_tagger.stopped` (tag `month`). Log lines and metrics carry task
identifiers and label names, never task text or the key.

## Metrics

The numbers for the before/after comparison in the tools plan (HAL-15920).
Only counts, no task or pull request text; the host puts the plugin's id in
front of each name. A metric that doesn't save is logged and changes nothing.

- **Each pass, per company** (tags `companyId`, `dryRun`):
  `pr_watcher.tasks_with_pr`, `.done`, `.woken`, `.failed`,
  `.github_requests`, `.github_requests_snapshot`, `.duration_ms`. In a dry
  run `done` and `woken` count what it would have done. The pass's log line
  also gives its GitHub calls by step ("42 GitHub calls on the shared token (snapshot 20,
  watcher 21, thin-spec 1)"), and the saved snapshot keeps its own count as
  `githubCalls`, and the token as `githubToken` (`shared`, or `app` once the
  reads move to the read-only GitHub App) (HAL-17933).
- **Monitors, each pass:** `monitors.set` (a Paperclip monitor due later on an
  open task), `monitors.fired` (one that fired in the last 10 minutes), and
  both again for tasks with a pull request (`*_on_pr_tasks`). Each fired
  monitor is one model run that only checks. A task closed since its monitor
  fired isn't open any more, so `fired` is a lower bound.
  `monitors.postponed` counts the fallback monitors the watcher moved later
  (or would move, in a dry run), `monitors.postpone_refused` the moves
  Paperclip refused. `monitors.deduped` counts the author's short checks
  (due within the hour) the watcher moved 6 hours out because a second wake
  would add nothing, split into `monitors.deduped_wake` (the watcher woke the
  author in the same pass) and `monitors.deduped_unchanged` (head and `ci-ok`
  unchanged since the last monitor wake, which the `state-packet` data key
  keeps per task; never with a failed `ci-ok` or a review finding on the
  head). Each move logs a line starting `Monitor dedupe:`; the
  `monitorDedupe` setting (`on` by default) turns it off
  (`paperclip.monitor-dedupe`, HAL-20175).
- **Each tool call** (tags `companyId`, `tool`, `outcome`): `tools.calls` and
  `tools.github_requests`. `ready_for_review` saves `tools.calls`,
  `tools.duration_ms`, one of `precheck.pass`, `.fail`, `.running`,
  `.unavailable` or `.error`, and, once a check is done, `precheck.duration_s`,
  all with the extra tag `result`. The `precheck-wake` job saves
  `precheck.answers` for each answer it posts (tags `companyId`, `job`,
  `result`, `woken`).
- **Each `gh` status read the guard sees** (tags `companyId`, `subcommand`,
  `agent`, `mode`): `tools.gh_redirected` (see gh guard above).
- **Each state packet asked for** (tag `companyId`): `state_packet.built` or
  `state_packet.none` (see State packet in monitor wakes below).
- **Each monitor wake the wake gate measures** (tag `companyId`):
  `wake_gate.would_skip`, `wake_gate.would_run` or `wake_gate.undecided`
  (see Wake gate below).

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
| `repos[].pulls[]` | `number`, `url`, `state` (`open`, `merged`, `closed`), `branch`, `headRepo` (a fork when it isn't `repo`), `base`, `head`, `updatedAt`, `mergedAt`, `mergeCommit`; added later, so possibly absent: `title` (cut to 200 characters) |
| `repos[].pulls[].open` | null when closed; else `draft`, `mergeable` (`yes`, `no`, `unknown`), `ciOk`, `draftCiOk`, `inQueue`, `labels[]` (`name`, `addedBy` who added it last, `addedAt`), `finding` (`id`, `at`), `approvals[]` (`by`, `head`); added later, so possibly absent: `githubApprovals[]` (`by` login, `head`: standing approving GitHub reviews by accounts other than the agents' shared one), `baseChangedSincePush`, `author` (login, null when the account is gone), `failingChecks[]` and `pendingChecks[]` (check names on the head, by their newest run, of the first 100), `reviewCounts` (reviewers' findings per severity tag, counts only) |

### The board's GitHub routes

`GET /api/plugins/halonic.agent-tools/api/github/summary?companyId=` and
`…/github/pr/{number}?companyId=` (HAL-17604, D2 in the phase 2
architecture on HAL-17511) give Halonic's `TeamStatus` provider pull
requests and the merge queue. Requirement `paperclip.github-routes`.

- **Board-only:** declared `auth: "board"` and checked again in
  `src/plugin/github-routes.ts`; an agent's key gets 403 and reads nothing.
- **No outbound request:** they read the stored snapshot, the board check's
  merge-speed record and the dequeue reasons from plugin state, and the
  board's login from the settings (`fastTrackLabelAdder`). The GitHub token
  stays with the jobs.
- **Trimmed** (`src/snapshot/summary.ts`): no login leaves them. The board's
  becomes "the board", a pull request from an agent's branch names the agent,
  anyone else is "outside contributor". No comment or review text; check
  names and dequeue reasons are cut to 120 characters.
- **`{number}`** must be a positive integer of at most 9 digits, else 404
  before anything is read; it is only compared with the snapshot's numbers.
- **Dequeue reasons:** the queue session writes them into plugin state,
  namespace `github`, key `dequeue-reasons`, as
  `{ version: 1, reasons: [{ repo, number, at, reason }] }`
  (`src/snapshot/dequeue.ts`). Until it does, a dequeued pull request has no
  reason.
- **Merges per agent** (`mergedByAgent`, HAL-17627): each agent's merges in
  the 7 and 30 days before the snapshot, with `countingSince`. The snapshot
  keeps only a few days, so every board check pass adds new agent merges to
  plugin state key `agent-merges` (pull request, agent, merge time; 30 days;
  `src/snapshot/agent-merges.ts`). Requirement `paperclip.agent-merge-counts`.

## Front bot run choice (v2)

HAL-19219, front bot v2 from the design on HAL-18847 section 2.3, with Liam's
condition 5. A quick question on a chat task doesn't need the agent's full
effort, and the front bot's first-reply call has already read it.

- **Who decides:** the first-reply call (`src/plugin/front-bot.ts`). While
  `frontBotRunChoice` is on, its prompt asks for a last line `Run: quick` or
  `Run: normal` (`src/front-bot/run-choice.ts`). The model never names a model
  or an effort: "quick" means the board's `frontBotQuickEffort` (`minimal`,
  `low` or `medium`, default `low`) and, if set, `frontBotQuickModel`.
- **Where it is kept:** per chat task, the newest message's comment id and
  choice (plugin state `front-bot` / `run-choice`). A normal run keeps "no
  choice", so the hook learns at once that nothing changes.
- **Who reads it:** the server, through the data key `front-bot-run-choice`
  (`src/plugin/front-bot-run-choice.ts`), just before a chat message's run
  starts, with `{ companyId, issueId, commentId }`. It answers only that
  message's choice, at most 10 minutes old, and waits at most 1.2 s for a
  message the bot is still on. No model call. The server patch
  (`halonic-com/server`, HAL-19219) gives up after 1.5 s, only ever lowers
  effort and only allows models on `HALONIC_TASK_MODELS`, for that one run.
- **Setting:** `frontBotRunChoice`, off by default; it also needs the front bot
  on. It goes on only after HAL-17402 is live and step 1 has been measured.
  Requirement `paperclip.front-bot-run-choice`.

## Wake-hold for chat bursts

HAL-19315, the plugin half of HAL-19292 (design in HAL-19223's
`wake-hold-draft`). Before Paperclip wakes a chat's agent for a person's
message, the server's patch asks the data key `wake-hold`
(`src/plugin/wake-hold.ts`) with `{ companyId, issueId, owedCount,
oldestOwedAt, newestOwedAt }`, never message text.

- **Wake now** when `wakeHoldEnabled` is off (the default), when the task
  isn't one of the company's chat tasks, or when a run on it is live (a
  message sent during a run already waits for it).
- **Otherwise a sliding hold:** `{ wake: "after", seconds }`, the setting
  `wakeHoldSeconds` (whole number 1–10, default 3) minus the seconds since the
  newest owed message, rounded up and at least 1; now once that has passed.
- No model or network call. The server waits at most 300 ms for the answer
  and never holds a message longer than 15 s. Requirement `paperclip.wake-hold`.

## State packet in monitor wakes

HAL-17402, with Liam's design review of 24 Nov. A wait-check run usually spends
its first turns on `task_get`, `pr_status` and `queue_state`. With the packet,
the run gets that state in its prompt and can decide on its first turn.

- **Who asks:** the server, through the data key `state-packet`
  (`src/plugin/state-packet-data.ts`), just before an `issue_monitor_due` run
  starts, with `{ companyId, issueId, wakeReason }`. It adds a packet it gets
  to the run's prompt. The server side is a local Paperclip patch in
  `halonic-com/server` (HAL-18684's follow-up). Without that patch nothing asks.
- **Setting:** `statePacket`, off by default. Off means no packet, so the wake
  is as before. The board turns it on for the 48-hour trial.
- **What it holds** (`src/state-packet/`): one line per pull request of the
  task, on an `<agent>/HAL-<n>-<words>` branch in the watcher's snapshot. Each
  line gives the state, the head, `ci-ok`, whether it is mergeable, the
  reviewers with a signed approval on the head, the merge queue position and
  its own `dataAsOf`. A merged pull request shows `ci-ok` on its merge commit.
  Below the lines come the task's 3 newest comments, JSON-quoted as untrusted
  data and each cut to 500 characters. The whole packet is at most 6,000
  characters; the oldest comments go first when it is over.
- **Fresh enough:** a line older than 5 minutes is read again from GitHub
  (`pr_status`'s read, or one `ci-ok` read on a merge commit) and kept as its
  own state entry (`github` / `pull-fresh:<repo>#<n>`). The watcher replaces
  the whole snapshot on each pass, so the line isn't written into it. The next
  wake takes whichever is newer. A merge commit whose `ci-ok` finished is never
  read again. A run reads a line again itself only when its `dataAsOf` is more
  than 10 minutes old.
- **Never half a packet:** no packet, with the reason in the log, when the
  task has no such pull request, the snapshot or a kept line can't be read, a
  GitHub read fails, the lines alone are over the cap, or the build takes
  longer than 8 seconds.

### Wake gate (measure only)

HAL-18985, lever 6 of the token plan on HAL-18938: many monitor wakes only
read state and hand off again. The gate works out from the same pull request
lines whether a wake had anything to do. For now it only measures: it logs and
counts its verdict, and the run always starts. Requirement `paperclip.wake-gate`.

- **Where:** on the same `state-packet` data key, after the packet is answered,
  so it never delays the run (`src/plugin/wake-gate-data.ts`, rules in
  `src/wake-gate/`). Only `issue_monitor_due` wakes.
- **Setting:** `wakeGate`, `off` by default; `measure` logs and counts.
- **Would skip** only when every pull request of the task waits on someone
  else (green and waiting for a review, the merge or the queue, or `ci-ok`
  still running on the head or the merge commit) and the newest comment, if
  any, is the assignee's own. A draft, a conflict, a red or missing `ci-ok`,
  a closed or landed pull request, or a newer comment from anyone else: would run.
- **Log line:** `Wake gate (measure only): would skip HAL-41: acme/rockets#41
  waits for the merge queue`, with the task's id in the log's fields, so the
  48-hour log can be set against what each run then did.
- **Switching it on** needs the server patch to skip the run on a `skip`
  answer; that is a later step, after the 48 hours.

## Fast-track rules

`src/fast-track/` is the board's Fast-track monitor session as rules inside
each `pr-watch` pass (HAL-15997 plan; rule list from the monitor's runbook,
posted on HAL-16003). It reads only the pass's snapshot and sends no GitHub
request. **Phase 1 only logs**: one line per task, `Fast-track (dry run)
HAL-…: …`, with every new reason and who it would go to (the task, the board
supervisor, the Merger), whatever `dryRun` says. The board supervisor
compares it with the monitor session for 2 days before it writes anything.

| Stage | When (each once per key) |
| --- | --- |
| `new` | a pass sees the `fast-track` label for the first time |
| `wrong_label:<adder>` | the label's last adder is neither the board's login from the `fastTrackLabelAdder` setting (counts everywhere) nor `halonic-dev` on a pull request in the `fastTrackSharedLabelScope` setting (unknown never counts): queued without a jump. That setting lists task identifiers, whose child tasks' pull requests count, and pull requests as `owner/name#123`; unset, it is the board's list of 24 Nov (HAL-17422, `halonic-com/halonic#5659`, `#5674`), and an empty list lets `halonic-dev`'s label count nowhere (HAL-16003 scope note) |
| `bot_label` | the pull request's author is a `[bot]` (HAL-16033) |
| `review_nudge:<head>` | ready for review (no draft, no check running) and not approved on the head by Liam (Julian on Liam's own): at once, to the task |
| `review_escalate:<head>` | still not approved on the same head 15 min after `review_nudge`: to the board |
| `check_fail:<check>:<head>` | ready and the check fails; not `Live cloud suites passed`, not a decision note (nor the requirement guard with it) before approval, not `ci-ok` while it is red only through those or another check still runs |
| `enqueue_ask:<head>` | approved and green on the same head for 10 min, base the default branch, not queued. A jump only when no other `fast-track` pull request is queued (it jumps only pull requests without the label, HAL-17697), the label counts, and more than 8 are queued or its number is in the `fastTrackUnblocks` setting; with another one queued, queued normally without a jump; otherwise first among those waiting |
| `queue_slow:<enqueuedAt>` | 30 min first in the merge queue (waiting behind others is normal) |
| `group_fail:<enqueuedAt>` | its group's `ci-ok` fails or the entry is `UNMERGEABLE` |
| `group_fail:removed:<enqueuedAt>` | it left the queue without merging |
| `merged` | it merged: the minutes from the label; then it stops being tracked |

A pull request that closes or loses the label stops being tracked, and its
keys are forgotten. **Jump log:** each `fast-track` queue entry, as first
seen: entries queued before it, its position, whether it jumped (position
at most half of those ahead), merges in the last hour, groups building, the
wait without a jump (13 min plus the rest of those ahead at the hour's
merge pace) and, once merged, the minutes from the queue. A line of totals
is logged once a day. The groups a jump rebuilt aren't counted yet (they
need the Actions runs). State: plugin state `fast-track`/`rules` per
company, the newest 200 queue entries.

Not in phase 1: the job log's first error lines in a `check_fail`, reading
the task before a nudge, the board's watched tasks, and the writes.

## Reviewer wake and UNHANDLED

`src/watchers/` runs after the watcher's tick in each `pr-watch` pass
(HAL-17938; Chief's answers on HAL-17940). Both read only the pass's
snapshot and plugin state (`merge-watchers`/`reviewer-wake` and
`merge-watchers`/`unhandled` per company) and send no GitHub request. While
`mergeWatchersDryRun` is on (the default), or the task setting is empty,
they only log what they would write.

- **Reviewer wake:** an open pull request on the watcher's first repository
  that waits only for its reviewer (out of draft, `ci-ok` green, mergeable,
  not queued, no signed approval on the head) for 60 min on the same head,
  30 min with `fast-track`, wakes Liam on `liamWakeTask` (Chat with Liam,
  HAL-45), or Julian on `julianWakeTask` (Chat with Julian, HAL-44) for a
  `liam/` branch. Once per head; one comment per reviewer per pass with
  every pull request due.
- **UNHANDLED:** a problem on the same pull request, head and kind for
  6 hours is reported once on `unhandledTask` (Chat with Chief, HAL-10), one
  comment per pass, waking Chief. Kinds: red `ci-ok`, a conflict outside the
  queue, a required check with no run, approved and green but not queued, an
  approval only on an older head, a red merge group, merge-group jobs
  waiting for a runner, and two exits from the queue without merging.
  Drafts and pull requests whose task is blocked with a blocker set are left
  out. A fix or a new head starts the 6 hours over.
- **Author nudges** (HAL-17929, `merge-watchers`/`author-nudge`): on the
  watcher's first repository, the task a branch names is woken once per head
  and kind, one comment per task, when the agent the branch names holds it:
  `stack_base_merged` (the pull request below merged and GitHub moved it to
  `main` with no push since; set to `todo` from any status; names a conflict
  and, when approved on the head, a range-diff re-approval), `conflict`
  (conflicting, out of the queue, task in `backlog` or `blocked`; set to
  `todo`; the PR watcher covers unparked tasks), `review_ready` (green, no
  signed approval on the head, unparked task: hand it to the reviewer) and
  `needs_hand_queue` (approved and green on a branch prefix in
  `handQueueBranches`: merge it by hand). The snapshot's `previousBase`
  comes from the base-change event the open pull requests query already
  reads, so it costs no extra call.

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

**The watcher keeps that monitor back** (HAL-16401 part 3). On a task it
watches with an open pull request, once the monitor is due within 5 hours
(but not within 1 hour), the watcher moves it to 6 hours out, so it stays 5
to 6 hours away and fires no model run while the watcher runs. If the
watcher stops, the monitor fires within 6 hours, as before. A monitor due
within the hour is the author's own CI check after a push, which the watcher
doesn't replace (it doesn't wake anyone for a green `ci-ok`), so it is left
alone. Paperclip's side (only an existing monitor, only later, at most 24 hours
out, an activity entry for each move) is the server patch in
`halonic-com/server` `paperclip/patches/1117/` (HAL-16413).

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
three board-only routes, the `seats.read`, `seats.history` and `seats.check`
jobs, the `seat_usage` tool and the board's "AI seats" page.

- **Settings** (board-only, empty by default): the seats in reading order,
  each with an id, a role (`pool`, `reserve` or `paid-api`), its Claude
  folder on the server, the account it should be signed in with, the id of
  its Claude connection in Paperclip and its manual reset group. The folder,
  account and connection id are sign-in details: nothing
  the plugin logs, stores or shows carries them. **Move agents** is off:
  the plugin then only proposes moves. **Task for proposed moves** names
  the task `seats.check` posts on; until it is set, nothing is proposed.
- **Tables** in the schema Paperclip gives the plugin
  (`plugin_seats_2a33967373`): `seat`, `reading`, `placement`, `event`,
  `agent_usage` and `agent_activity`, as `src/seats/records.ts` describes
  them. Paperclip runs `src/seats/plugin/migrations/` before the worker
  starts and refuses `DROP` and `DELETE` there, so a change adds a file.
- **Routes**, board users only (the worker checks again), under
  `/api/plugins/<plugin id>/api/`: `GET /seats` lists the seats with their
  id, role and reset group only, `GET /seats/page` gives the "AI seats"
  page's data (below), `GET /seats/summary` gives Halonic's `TeamStatus`
  provider each seat's label, role, newest reading time, windows (used %,
  reset, when they reach 90%), agents by name and whether its manual reset
  is used, when a failed newest read ran (`failedReadAt`), plus the
  proposal `seats.check` would post now as plain text, and, with
  `?from=<ISO time>` at most 31 days back, `unknownSeatRuns`: the runs since
  then with cost rows but no seat. It is built field by field so a folder,
  account, connection id or sign-in expiry never leaves. `POST /seats/:seatId/manual-reset`
  records a manual reset by the board user. Seats in one reset group share
  one manual reset, so a second one in the group is refused (409); a seat
  without a group is a group of its own. Manual resets stay when old rows go.
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
- **`seats.check`**, every 10 minutes at :05, :15 and so on, after the
  reads: puts each seat's state together from the last 6 hours of readings
  and the manual resets, finds which seat each agent is on now, and runs the
  placement rules (`src/seats/placement-rules.ts`). It posts the proposal
  on the board's task only when its moves or reset advice change, and keeps
  the last one in the plugin's state. It moves no one, whatever **Move
  agents** says: the board applies the moves.
- **`seat_usage`**, an agent tool, read-only: each seat's id, role and
  reset group, how its newest read went (`ok`, `rate-limited`,
  `signed-out`, `no-reading` and so on), its newest stored windows with
  how many minutes old they are, and the alerts `seats.read` holds. It
  answers from the `reading` table and the reader's memory and never reads
  a seat itself, so a seat has one reader only. It answers only the agents
  listed in the board-only setting **Agents that may call seat_usage**
  (the Seat Supervisor and Chief, HAL-16192), which is empty by default.
  The database's error goes to the plugin's log, not to the agent.
- **The page's data** (`GET /seats/page`, `src/seats/plugin/seats-page.ts`):
  the pool's weekly points left over the readable pool seats and its points
  per hour now, the pool seats' weekly refills of the next 7 days, a row per
  seat (state, reading age, next read, sign-in expiry, alerts, both windows
  with when each reaches 80% and 90% before its reset, and its agents by
  name), and the moves `seats.check` would propose now. It moves no one. The
  run-out time, the sustainable rate and the forecast at reset come with the
  seat forecast (HAL-16026).
- **The "AI seats" page** (`src/seats/ui/`), a Paperclip page built only
  from the SDK's own components: the top cards, the seat table, the weekly
  points coming back in each hour of the next 7 days, the proposed moves
  with their reason, and a button to record a manual reset. It gets the
  page's data through Paperclip's data bridge, which answers only board
  users; its Refresh button asks again. Paperclip lets agents call plugin
  actions too, so the reset action refuses anyone who isn't a signed-in
  user and takes the company only from Paperclip's own check. The page
  imports only the SDK and its bundle (`ui/index.js`) leaves React out:
  Paperclip's page provides it, so the package depends on `@types/react`
  only.

Build it with `pnpm --filter @halonicjs/tooling-paperclip run
build:seats-plugin`. That writes `dist/seats/`: the bundles, the page's
bundle in `ui/`, the migrations and the folder's own `package.json`, which the board installs from
(Settings → Plugins). It isn't installed, and no seat's sign-in moves into
it, until HAL-16015 is done.

## Seat mover (`seat-move`)

The Seat Keeper's seat moves, as code (HAL-19354, `src/seat-mover/`). Every
minute, unless `seatMover.mode` is `off`, the job reads the seat readings plugin's
`seats` data (the plugin named in `seatMover.readingsPlugin`), the AI connections, where each agent sits
(`runtimeConfig.aiConnection`) and, from `heartbeat_runs`, the runs parked for
a seat that never started and the `provider_quota` failures of the last hour.

An agent leaves its seat at the 5-hour stop (80%, 70% for a reviewer), at the
weekly hard stop (95%), on a reserve seat (past the weekly stop, 88%) when it is
a fast burner, after a `provider_quota` failure on the seat since its
reading or in the last 30 minutes (until the 5-hour reset the reading reports),
with runs parked on it or naming no seat, on an excluded seat or the paid API,
as a running heavy agent beside a reviewer, as a heavy agent past the limit, as a running heavy agent on the
quiet seat, or on a connection that isn't `connected` (expired or revoked). Every target passes the board's
checklist (`src/seat-mover/checklist.ts`): (a) week below 95%, and for a fast
burner (`seatMover.fastBurners`) below 88% unless the seat's weekly reset is
under 24 hours away; a reset-fill seat takes anyone; (b) reviewers
alone (light agents may stay with them, but no other reviewer, running heavy
agent or never-move agent), on an empty seat when one may take them, then the
seat with the most 5-hour room, and nobody joins them; (c) at
most two heavy agents a seat; (d) never an excluded seat (Admin, and the board
adds its own); (e) never the paid API; (f) never a seat at its 5-hour stop, counting 10% of the window
(`seatMover.targetHeadroomPercent`) for the agent and each one the pass already
sends there, so the next reading doesn't move them off again, or
one with runs parked waiting for it or a fresh `provider_quota` failure;
(g) for a running heavy agent, never the quiet seat (a seat an agent on
`seatMover.pinned`, the seat starter or a timer agent, sits on).
Reviewers pick first, then the fast burners, then heavy agents, then everyone
else. Among the legal seats, the one the pass has sent the fewest agents to comes
first, so agents leaving one full seat spread out (HAL-19394). An agent no seat
may take stays, and the board task hears of it once. A paused agent is never
moved, and an agent the mover moved less than two hours ago
(`seatMover.moveCooldownMinutes`) moves again only when it is parked or its
seat is full, not for who it sits with (the board's audit rules of 26 Nov).

- `shadow` (the default): logs the plan and comments it on `seatMover.logTask`
  when it changes; moves nobody.
- `act`: sends each agent's whole `runtimeConfig` with only `aiConnection`
  changed, re-reads it and puts `heartbeat` back if it changed, then releases
  runs still parked on seats their agents left (cancel, resolve the recovery
  hold as restored, wake the task once). Each batch is one comment on the log
  task. Needs `paperclipApiUrl` and a **board** key in `paperclipApiKey`.

## Merge control

The `merge-control` job (ADR `docs/adr/2026-11-24-merge-controller-is-tested-code.md`)
runs every minute and does nothing while `mergeControl.mode` is `off`, the
default. Otherwise each pass reads the facts (`src/merge-control/facts.ts`),
runs `decide`, and in `shadow` mode writes nothing and posts a daily diff with
the Merger's actions on `mergeControl.diffTask`. `act` needs the board's yes.
The diff also lists, under "Needs a Paperclip copy with a full-SHA match",
each pull request whose gate passed without Liam's or Julian's Paperclip copy
of the approval of its full head (`src/merge-control/shadow-copies.ts`,
HAL-19324); nothing is refused for it.

It queues open `built-on:paperclip` pull requests. A `built-on:halonic` one
is queued only when it also has `fast-track` added by a login in
`fastTrackLabellers` (board, HAL-18304); then it's a fast-track pull request
under the normal jump rule. The `built-on:halonic` label alone never queues it.

The facts reader uses the PR watcher's read-only token and its two readers
(GET-only REST, query-only GraphQL), so `pr-watcher-read-only` still holds.
A pass reads the open pull requests 10 per page (about 6 seconds and 2
points a page on 24 Nov), the merge-group runs of the last day, the queued
pull request runs and `main`'s CI runs. What never changes once read (a
finished run's failed jobs, a head's manifests, a file on one `main` commit,
who reran or cancelled a run) is kept in the worker's memory. Patch-ids need
git, so for a pull request whose approval names an older head the reader
fingerprints GitHub's compare of each head from the base instead, the PR
watcher's rebase-only check (HAL-18460); an approval carries over a rebase when
both match. A compare GitHub can't give or fails leaves it null: no carry-over.

Settings under `mergeControl`, all empty by default:

- `ciStatusUrl` and `prometheusUrl`: where Paperclip's server reaches the CI
  server's `ci-status.json` (free merge-queue slots) and Prometheus
  (`halonic_ci_live_jobs_waiting`). Unset, unreachable or older than 5 minutes,
  capacity is unknown and nothing jumps.
- `mergerLogin`: the account the Merger acts as, so shadow mode can read what
  it did. It lives only in the settings, never in the repo.
- `noraShadow`: on unless set to `false`. While on, a pull request whose only
  counted approval is Nora's still needs Liam's, so it gets a review task.

**Review tasks (HAL-20636).** In both modes, each pass keeps one task per pull
request and reviewer for an approved, green pull request that waits only for
Julian's security sign-off, or for Liam after Nora's approval
(`src/merge-control/reviewer-asks.ts`). The task is assigned to the agent the
routing names for the role (`todo`, `high`), is a child of the task the branch
names, and is woken. A new head on the same wait wakes it again. Once the wait
is gone, or the pull request merges or closes, the task is closed. While
`mergeWatchersDryRun` is on, it only logs.

**GitHub call budget (HAL-17913).** Reads go out on `githubToken`, the
read-only GitHub App's installation token, which the host renews every
10 minutes: each pass reads the secret once at its start, and once more
only after a 401, then retries once (`src/merge-control/read-client.ts`).
Writes (enqueue, dequeue, comments, reruns, cancels) go out only on
`mergeQueueToken`. A GET answered less than 90 s before is served again
without asking GitHub, and older ones send their ETag, so a 304 isn't
charged. Each token's calls are counted per UTC hour against its own budget,
together with the lowest remaining limit GitHub named. Each pass logs one line:

```text
GitHub budget: reads 40 this pass, 11960 of 12000/h left, resets 12:41 UTC; writes 3 this pass, 3497 of 3500/h left, resets 13:00 UTC
```

When either budget's remaining count drops below its threshold, or GitHub
refuses the read token twice or says its limit is used up, the pass degrades
instead of stopping. The next passes wait `degradedIntervalMinutes`, and a
pass with the read budget low skips what only shadow mode and the
known-flake check read. Settings under `mergeControl`: `readBudgetPerHour`
(12000), `readLowAt` (1000), `writeBudgetPerHour` (3500), `writeLowAt` (350)
and `degradedIntervalMinutes` (5).

**One set of rules for the Merger (HAL-18337).** `build:plugin` also writes
`dist/merge-control-decide-<version>-<hash>.js`: `decide` and the rules
behind it, bundled into one ES module with nothing from Node, so it can't
read the clock, network or files. `<hash>` is the first 8 hex digits of the
bundle's SHA-256: one plugin version holds many rule changes, and the hash
names the exact rules. The Merger keeps its own reads, writes and schedule,
and on each pass calls

```js
const { decidePass } = await import("./merge-control-decide-0.10.0-8c09f745.js");
const answer = decidePass({ snapshot, state, settings: { fastTrackLabellers }, now });
// answer: { actions, state, log, rules: "halonic.agent-tools@0.10.0+8c09f745", format: 2 }
```

with the snapshot as `src/merge-control/snapshot.ts` describes it, the state
the previous answer returned (null the first time), only the settings that
differ from `defaultSettings`, and the time as an ISO string. It carries out
`actions` and logs `rules`, so its log says which rules decided. A bad time,
an unknown setting or one of the wrong type, another state version or a
snapshot missing a list throws; the Merger then falls back to its own rules
for that pass. A state saved by older rules gets the fields added since
from the empty state. `format` 2 (HAL-18470) adds the `reopen` action: a
Merger that knows only format 1 should fall back to its own rules for an answer
of another format. Older files can stay beside the new one, and a rule fix
reaches the Merger by copying in the next one.

## Reviewer path list

`reviewerFor({ files, changedLines, sensitive })` answers `julian` or `liam`
by the rules of HAL-14809 (widened on 22 Nov and on HAL-18459). Pass each
changed file's lines in `fileLines`, so tests, Markdown and wording don't count
toward the 1500-line limit and the 800-line limit in the kernel and event
types; without them the whole pull request's lines count once it changes any
code. Pass each changed
`package.json`'s text at the merge base and the head in `manifests`, or that
manifest counts as Liam's; `pr_status` reads them from the contents API. Scripts
that route pull requests import it from here, so there is only one list.

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
