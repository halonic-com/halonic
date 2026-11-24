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
backtest.

We looked at three places for it:

1. **Check the scripts into the repo as they are** and add tests. The rules
   and the GitHub calls are mixed in one file, so each test would need a fake
   GitHub, and a backtest would be impossible.
2. **A scheduled GitHub Actions workflow.** Its schedule runs at most every
   5 minutes and often late, it would spend CI runners on itself, and it
   can't read Paperclip tasks or keep state between runs.
3. **A second job in the Agent tools plugin**, next to the PR watcher. It
   already reads the GitHub snapshot the controller needs, keeps plugin
   state, and has the approval, reviewer-path, queue-priority and
   fast-track code. We chose this.

## Decision

**One job, three layers.** The `merge-control` job in `tooling/paperclip`
runs every minute. It has the PR watcher's split:

- `facts.ts` reads. It reuses the `pr.watch` snapshot reader and adds what
  the gate needs: signed approvals and change requests on each head,
  required workflows after the last retarget, `live-cloud`, who added
  `fast-track`, patch-ids for rebase carry-over, failed and stalled
  merge-group runs, runner wait, and each task's priority and "blocked by".
- `decide.ts` is pure: `decide(snapshot, state, settings, now)` returns
  `{ actions, state, log }`. No I/O, no clock, no randomness.
- `act.ts` carries the actions out, one at a time, and records each result.

**A closed list of actions**, each with a key so it happens once per head:
`enqueue` (with `jump` or not), `dequeue` (with a reason), `rerun-failed-jobs`,
`rerun`, `cancel-run`, and `comment` on a PR from a fixed set of texts
(today's Merger texts, without `@` names). Task actions (close the task,
hand it to its reviewer, unblock dependents, nudge the owner) stay in the
PR watcher, which already owns them (HAL-17675, HAL-17692); both jobs read
the same snapshot, so each action has exactly one owner.

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
boost). Each rule has a requirement file under `requirements/merge-control-*`
and a test that feeds it a fixture snapshot. Shared code is imported, not
copied: `reviewerFor`, `approvals.ts`, `queue-prio.ts` and the fast-track
jump log.

**State is one versioned plugin state entry**, replacing `state.json`:
culprit holds, cooldowns, unmergeable-since times, ready-since times, heads
already commented on or rerun, and jumps. The board's switches live in the
same entry and are set only through a board-only route, never an agent
tool.

**Every pass is recorded, and a simulator replays a day.** Each pass stores
its snapshot and its actions (14 days kept). The simulator steps through a
day a minute at a time, calls `decide` with a chosen rule set, and plays
GitHub's part with times measured from the recordings: CI on a PR, a merge
group's build, review delay and group failure rate. It reports time to
merge (median and 90th percentile), queue wait, groups cancelled by jumps
or removals, and jumps. The first days come from the Merger's
`queue-snapshots.jsonl` and `gate-report.json`, through a one-off importer.

**Modes: off, shadow, act.** The job starts `off`. In `shadow` it decides
but sends no write, compares its actions with what the Merger did (read
from GitHub), and posts one diff a day on HAL-17700. `act` needs the
board's yes; then the Merger agent is retired or kept for judgment calls
only.

**A separate write token, used only by `act.ts`.** Reads keep the
read-only token (`pr-watcher-read-only` stays true for the PR watcher). The
controller's write token is its own secret, fine-grained to
`halonic-com/halonic`: pull requests write (queue, comments), Actions write
(reruns, cancels) and workflows write (GitHub refuses to queue a PR that
changes `.github/workflows/` without it). The write client allows only a
fixed list: the `enqueuePullRequest` and `dequeuePullRequest` mutations, run
rerun, rerun of failed jobs, run cancel and a PR comment, all to
`api.github.com`; anything else is refused before it is sent. The token is
resolved at each call, never stored in state, logs, recordings or errors,
and no agent tool can reach the client.

## Consequences

- A rule change is a reviewed pull request with a test, and the simulator
  shows what it would have done to a recorded day before it merges.
- The Merger's knowledge moves into requirements; the agent's prompt
  shrinks to the calls code can't make (is this failure in the PR's code?).
- The plugin gains its first GitHub write path. Julian reviews the write
  client and the token's scope; the allow-list has its own requirement and
  test, like `pr-watcher-read-only`.
- The work lands as stacked pull requests: the decision core with its
  tests, then the recorder and simulator, then the job with shadow mode.
  Switching to `act` is a configuration change after the board's yes.
- Until then the Merger keeps running; nothing changes for authors.
