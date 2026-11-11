# Decision: `halonic routines watch` gives up on a stuck run after an hour

- Approval: [HAL-5294](/HAL/issues/HAL-5294), decided by the maintainer (Liam) in its decision note; he approves this note in review of [HAL-5300](/HAL/issues/HAL-5300)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6gPGqiMz/QRb04lhG89uhpLscyHP8EWrTHyXiI8b97O+SmEVkam9iALd1U1QCswvl6hYy0Tg0zWJq6Gfam5+Bg==
- Task: HAL-5300

## What changes

`cli.commands.routines.watch` said the watch keeps watching past a stuck run while the engine
keeps retrying its step (HAL-5064). The scheduler retries a failed timer for ever, every 15
minutes once its backoff is full, and each try of a `call:` step may pay for a model call again.
The requirement now also says that once the step has kept failing for an hour, from its first
failure in a row, the watch gives up on the run: it cancels it with the engine's `cancel`, or,
when that fails too, leaves that step untried until the next watch or run, prints a ✕ line, and
keeps watching. It measures the hour on the engine's clock, and gives up no earlier than the
third failure, so a laptop that slept through the hour still gets its tries. Nothing is
weakened: the scheduler and its port don't change, `halonic run` and `halonic runs send` keep
stopping at a stuck step, three failed ticks or wake-ups in a row still stop the watch, and the
watch's tests only grow. The new lines are team wording built on the watch's approved ✕ line
(HAL-2282).

## Covers

- cli.commands.routines.watch
