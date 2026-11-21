# Decision: Studio's run page says two more known causes instead of "can't tell the cause"

- Approval: Liam approves this note in his review of this pull request on HAL-13882 (a team decision with no board card, HAL-2282 rule: it adds sentences to a banner the board already approved)
- Kind: user-visible
- Task: HAL-13882

## What changes

`@halonicjs/app` marks `disk-full`, `interrupted` and `answer-not-an-option` as a known cause
(HAL-6451), and HAL-13862 adds an `error` whose cause is `harness-bridge.socket-path-too-long`.
The CLI says each as the reason. Studio's run page builds its banners from the run's reason and
typed cause, not from `causeKnown`. It already had banners for `disk-full` and `interrupted`, but
the other two fell through to "*Workflow* failed in the step *step*. Halonic can't tell the cause
yet.", with Copy details for a bug report.

- `answer-not-an-option`: "*Support reply* stopped in the step *Draft*: *Triage* answered with
  something that isn't one of its options. Make its instructions stricter, or pick a larger model,
  then run again." The agent is the parallel branch whose answer it was, or else the agent that
  started last. The answer itself never shows: it is the model's own text.
- A run whose cause is `harness-bridge.socket-path-too-long`: "*Support reply* stopped in the step
  *Draft*: the path to Halonic's data is too long for the bridge's socket (161 bytes, and Linux
  takes at most 107). Move Halonic's data to a shorter path, then run again." The figures come
  from the cause's detail, never from the engine's message, and are left out when one is missing.
  A phone says "…to a shorter path on your computer…".

## Why

The run page doesn't show the engine's message (`runs.run-view.failure-banners`), so reading
`causeKnown` alone would leave a banner with nothing to say. A banner of its own per known cause,
in Studio's words and from typed facts, keeps that rule and says what the CLI says. Both
sentences follow the `disk-full` banner's form ("stopped in the step *step*: cause. Fix, then run
again.") and the engine's own fix for each cause.

## Not in this change

A bridge the agent host opens still sends back only its message, not its `failureCause`, so a
socket path that is too long there gets the general banner. The cause code is read as a string,
so this works once HAL-13862 (#4086) is merged and does nothing before.

## Tests

No test was weakened or removed. New cases cover both banners, the parallel branch's agent, a
log without an agent, a cause without all its figures, and the phone sentence.

`failure-banner.test.ts` had grown past the 500-line limit with them, so the known-cause cases
(full disk, stopped engine, off-option answer, long socket path) moved unchanged to
`failure-banner-known-causes.test.ts`, and the setup both files share to
`failure-banner.test-helper.ts`. The package runs the same 522 tests (32 in that file instead of 40).

## Covers

- runs.run-view.failure-banners
- packages/studio/features/runs/src/run-view/failure-banner.test.ts
