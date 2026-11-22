# Decision: a Claude Code step keeps its result when the program doesn't exit afterwards

- Approval: HAL-15968, Owen's plan (option A) approved with changes by Liam
- Kind: user-visible

Today a Claude Code step whose program prints its result and then doesn't exit
fails the whole run: after 10 seconds Halonic kills it and the run ends with
"Claude Code didn't exit within 10 seconds, so Halonic stopped it." The result,
already printed in full, is thrown away. The HAL-12475 scored runs lost a task
twice this way, both times in a tester step, most likely because a process one
of its shell commands started kept Claude Code from exiting.

**What changes.** `harness-kit.exit-within` still waits at most 10 seconds and
still kills a program that hasn't exited, with everything it started. When the
program had already given its result, the harness now keeps it, records a new
run-log event, `harness.stopped` (`events.harness-stopped`, with `state`,
`agent`, `harness`, `reason: "no-exit-after-result"` and `afterMs`), and the
run goes on. A program that hangs before its result still ends the run with
the same error as before, and a kill that fails still fails the run, since the
program may still be running. The old example for the after-result case is
replaced by the new behaviour; its test moved to the before-result path with
the same assertion, and new tests cover the kept result and the failed kill.

`ports.harness-run-events` lists `harness.stopped` among the event types a
harness reports. The engine adds the step's `state` to it, as it does for
`agent.finished`. The event is generic: Codex doesn't need it today, since it
stops its app server itself after its final event.

**Why.** The program's work is done and its result is complete, so failing the
run punishes the workflow for a leftover process Halonic stops anyway. The
`harness.stopped` record keeps the stop visible in the run log. A line for it
in Studio's run view is a follow-up, since it is new wording.

## Covers

- harness-kit.exit-within
- ports.harness-run-events
- events.harness-stopped
