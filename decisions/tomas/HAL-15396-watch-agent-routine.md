# Decision: routines watch leaves out a routine whose agent is in a harness, and starts the others

- Approval: the task HAL-15396 asks for this change, from flow check C570 #2 (HAL-15386). It allows refusing only that routine or marking it in the list. The team decides under the HAL-2282 rule: the wording builds on "Can't start", approved for the list and the Studio, and Liam signs this note in review.
- Kind: user-visible

## What changes

- `cli.commands.routines.watch`: a routine that is on and runs an agent in Claude Code or Codex, or a workflow with such an agent, is left out on every tick, as HAL-15372 leaves out a routine whose file has errors. The first tick prints "✕ Daily notes can't start: routines can't run agents in Claude Code yet, and Coder is in Claude Code. Set the agent to Halonic's own loop, or turn the routine off." once, and the other routines start. Before, one such routine stopped the whole watch with exit 9 (HAL-13857). The fix sentence says "Halonic's own loop", as `validate`, `run` and `trust` do, instead of "Halonic's own harness". One example is added.
- `cli.local-harness-host`: "`routines watch` shall still refuse one" becomes "shall still not start one: it leaves out a routine that would". The watch still starts no harness agent. The per-run checks of a later version keep refusing one, as before.

## Why

C570 #2: `routines list` showed the Claude Code routine with a next run and no ✕, and then `routines watch` ran nothing at all. The task's option to refuse only that routine also matches HAL-15372, which already leaves out a routine that can't start for a file error. It matches the Studio's scheduler as well, which starts the routines it can. Leaving the routine out changes nothing about what may run: it never starts, and a later version that moves an agent into a harness is still refused by the run's own check. Trust is the workspace's, so a workspace with an agent in a harness now gets the trust check before the watch, as `halonic run` gives it, instead of the old exit 9.

## Tests

No test was weakened or skipped.

- `routines/watch.test.ts`: the two refusal tests now check that the routine is left out, with its ✕ line, and that the others start. The routine with an agent in Claude Code runs every minute next to Hourly follow-up, and only Hourly follow-up starts at 15:00. Neither test passes on `main`, where the watch exits 9.
- `routines/watch-live-version.test.ts`: the test of a newer version whose agent moves into Claude Code on a computer without a sandbox now expects that routine's can't-start line instead of a "didn't start" line with the sandbox reason. The tick leaves it out before its run's sandbox check, and it still starts no run.

## Covers

- cli.commands.routines.watch
- cli.local-harness-host
