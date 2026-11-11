# Decision: `halonic routines watch` keeps watching when one run gets stuck

- Approval: [HAL-5064](/HAL/issues/HAL-5064), raised by the maintainer (Liam) in his review of #1645 on [HAL-5060](/HAL/issues/HAL-5060); he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Ak0P3svJ3V9L6PFQjp5cZ85/WEQnpx7WRxRwkU196Ss3ZvVPIeU5TkSI6rxEGLp0PS8ub/tNQFJ6jfjfx6ecCg==
- Task: HAL-5064

## What changes

`cli.commands.routines.watch` said a run whose step keeps failing stops the watch, as it stops
`halonic run`: the third failure ended the whole watch, and no routine started after that until
someone restarted it. That was recorded as the 0.1 rule in #1645 (HAL-5080) until this change.
The requirement now says the watch prints a ✕ line for a stuck run, with the reason under
`--debug`, and keeps watching while the engine keeps retrying that step. Nothing is weakened:
`halonic run` and `halonic runs send` keep stopping at a stuck step, three failed ticks in a row
still stop the watch, and the watch's tests only grow. The new lines are team wording built on
the watch's approved ✕ line (HAL-2282).

## Covers

- cli.commands.routines.watch
