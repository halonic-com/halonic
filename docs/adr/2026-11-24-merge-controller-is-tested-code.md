# The merge queue is run by a tested plugin job, not by an agent

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

The merge queue on `halonic` is run by the Merger, an agent that runs a
30 KB script (`pass.js`, with `gate.js`, `rerun.js` and a few helpers) every
2 minutes. The agent changes the rules in place while they run: there are
15 backup copies, no tests and no review, and a rule change can't be tried
against yesterday's queue before it goes live. The board asked (HAL-17700)
for code that always makes the right moves and that we can test and
backtest. The rules weren't the only cause of the bad hours: on 24 Nov at
18:03 merge-group jobs waited up to 4.5 minutes for a runner while jumps
cancelled the groups behind them (6 jumps and 23 cancelled group runs
between 17:53 and 18:15).

We looked at three places for it:

1. **Check the scripts into the repo as they are** and add tests. The rules
   and the GitHub calls are mixed in one file, so each test would need a fake
   GitHub, and a backtest would be impossible.
2. **A scheduled GitHub Actions workflow.** Its schedule runs at most every
   5 minutes and often late, it would spend CI runners on itself, and it
   can't read Paperclip tasks or keep state between runs.
3. **A second job in the Agent tools plugin**, next to the PR watcher. It
   already reads the GitHub snapshot the controller needs, keeps plugin
   state, wakes agents, and has the approval, reviewer-path, queue-priority
   and fast-track code. We chose this.

## Decision

**One job, three layers.** The `merge-control` job in `tooling/paperclip`
runs every minute. It has the PR watcher's split:

- `facts.ts` reads. It reuses the `pr.watch` snapshot reader and adds what
  the gate needs: signed approvals and change requests on each head,
  required workflows after the last retarget, `live-cloud`, who added
  `fast-track`, patch-ids for rebase carry-over, failed and stalled
  merge-group runs, each task's priority and "blocked by", and **runner
  capacity**: free merge-queue (large) slots, jobs waiting per runner label,
  and groups cancelled in the last hour, from the CI live metrics
  (`halonic_ci_live_*`) and the CI server's status file. Capacity it can't
  read counts as short.
- `decide.ts` is pure: `decide(snapshot, state, settings, now)` returns
  `{ actions, state, log }`. No I/O, no clock, no randomness.
- `act.ts` carries the actions out, one at a time, and records each result.

**A closed list of actions**, each with a key so it happens once per event
and head:

- queue: `enqueue` (with `jump` or not), `dequeue` (with a reason);
- CI: `rerun`, `rerun-failed-jobs`, `cancel-run`;
- branch: `update-branch` (rebase on `main`), see below;
- talk: `comment` on a PR from a fixed set of texts (today's Merger texts,
  without `@` names), and `wake` a task's agent with the facts in the comment.

**Every event wakes the right agent at once.** A red check, a failed group,
a conflict, a dequeue, a missing note signature, or a review not started
within the fast-track window becomes a `wake` action for the author, the
reviewer (by `reviewerFor`) or Julian for security scope, with the facts in
the comment. The PR watcher's task rules (done, hand to the reviewer,
unblock dependents, HAL-17675 and HAL-17692) move into this core, so every
event has one owner and one test; the PR watcher job keeps only what has no
pull request to act on.

**Every rule is ported, one module and one requirement each.** The gate
(signed approvals on the current head, rebase carry-over, Julian's scope by
`reviewerFor` with Liam's paths, "Author: Liam", open change requests,
`ci-ok`, required workflows, `live-cloud`, base is `main`, mergeable,
hotspots, culprit hold, cooldown, file size on top of the queue), the
removal reasons (conflict, unmergeable for 15 minutes, change request, head
moved, culprit), the fill order (`queue.prio`, fast-track first, target 15),
fast-track (verified labeller, all ready ones in one pass, jump only with
more than 8 entries ahead and no fast-track PR queued, never a re-jump,
HAL-17697), reruns (cancelled `ci-ok`, known infra flakes once per head,
HAL-17685, stalled front groups), stale-run cancels, the runner brake, and
the board's switches (hold a PR, pause filling, main-red freeze, priority
boost). **Capacity gates jumps:** with too few free merge-queue slots or
jobs already waiting, the core doesn't jump. Each rule has a requirement
file under `requirements/merge-control-*` and a test that feeds it a fixture
snapshot. Shared code is imported, not copied: `reviewerFor`,
`approvals.ts`, `queue-prio.ts` and the fast-track jump log.

**Each decision carries its cost.** For every jump or dequeue, `decide`
also returns the groups it cancels and their runner-minutes, so the log,
shadow mode and the simulator compare rule sets on the same number.

**Proactive rebase after a merge.** After `main` moves, the core picks
approved or ready PRs that now conflict, are behind, or would conflict in
the queue, fast-track and queue-bound ones first, and updates their branch
by rebase. A clean rebase with an identical diff keeps its approval
(carry-over, as today). A failed one wakes the author at once, with the
conflicting files.

**State is one versioned plugin state entry**, replacing `state.json`:
culprit holds, cooldowns, unmergeable-since times, ready-since times, heads
already commented on, rerun or woken for, and jumps. The board's switches
live in the same entry and are set only through a board-only route, never
an agent tool.

**Every pass is recorded, and a simulator replays a day.** Each pass stores
its snapshot, its actions and their cost (14 days kept). The simulator steps
through a day a minute at a time, calls `decide` with a chosen rule set,
and plays GitHub's part with times measured from the recordings: CI on a
PR, a merge group's build, runner slots, review delay and group failure
rate. It reports time to merge (median and 90th percentile) for fast-track
and other PRs, queue wait, groups cancelled, runner-minutes lost, and
jumps. Before the recorder has history, a one-off importer builds days from
the Merger's `queue-snapshots.jsonl`, `gate-report.json` and
`queue-manager.log`, the fast-track watch log and merged-PR cache, and the
CI metrics history, so 24 Nov, jump storm included, can be replayed.

**Rule candidates are tried in the simulator first.** The first one is
"front of the line without a rebuild": a fast-track PR is queued without
`jump`, and only when the queue rebuilds anyway (a group fails, a PR is
removed, a merge invalidates groups) does the controller put fast-track PRs
first when it re-queues. GitHub offers `jump` only at enqueue, so this
works only at moments the controller already re-queues. If it beats
today's rule on time to merge, cancelled groups and runner-minutes, it
becomes the rule.

**Modes: off, shadow, act.** The job starts `off`. In `shadow` it decides
but sends no write, compares its actions with what the Merger did (read
from GitHub), and posts one diff a day on HAL-17700 with each differing
decision's cost. `act` needs the board's yes; then the Merger agent is
retired or kept for judgment calls only. Until then the Merger's rules and
this code have one source: every live change to `pass.js` or `MERGER.md`
is added here as a test case, so shadow mode doesn't compare against a
moving target.

**Narrow credentials of its own, used only by `act.ts`.** Reads keep the
read-only token (`pr-watcher-read-only` stays true for the read path). The
Merger acts through a board member's login today, so its actions look like
theirs; the controller gets its own identity instead, a GitHub App or
fine-grained tokens that the board creates, with two separate credentials:

- **queue:** the `enqueuePullRequest` and `dequeuePullRequest` mutations,
  run rerun, rerun of failed jobs, run cancel and a PR comment (pull
  requests and Actions write, plus workflows write, without which GitHub
  refuses to queue a PR that changes `.github/workflows/`);
- **branch:** only the `updatePullRequestBranch` mutation with the rebase
  method (contents write), kept apart so a leak of one can't do the other.

Each write client allows only its own list, all to `api.github.com`;
anything else is refused before it is sent. Tokens are resolved at each
call, never stored in state, logs, recordings or errors, and no agent tool
can reach the clients. Julian reviews both.

## Consequences

- A rule change is a reviewed pull request with a test, and the simulator
  shows what it would have done to a recorded day before it merges.
- The Merger's knowledge moves into requirements; the agent's prompt
  shrinks to the calls code can't make (is this failure in the PR's code?).
- Agents hear about a red check, a conflict or a dequeue within a minute,
  not at the next hourly check.
- The plugin gains its first GitHub write paths. Julian reviews the write
  clients and the credentials' scope; each allow-list has its own
  requirement and test, like `pr-watcher-read-only`.
- The work lands as stacked pull requests: the decision core with its
  tests, then the recorder and simulator, then the job with shadow mode;
  after them, separately, the event wakes, the proactive rebase and any
  rule a backtest wins. Switching to `act` is a configuration change after
  the board's yes.
- Until then the Merger keeps running; nothing changes for authors.
