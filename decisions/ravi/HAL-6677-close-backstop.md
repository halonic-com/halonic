# Decision: a stopped command doesn't wait forever for its engine to close

- Approval: Liam asked for this backstop on [HAL-6677](/HAL/issues/HAL-6677), from Sofia's walk on [HAL-6673](/HAL/issues/HAL-6673); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Wrsz1zrddiWsSx8WEYzTut5K4qjTVPDlDGSZMxm3LKwp8Tg6QCD8cRK2t23eAVEqCCOHbzz5pPG0rw2GuEfhBA==
- Task: HAL-6677

## What changes

`cli.local-engine-lock` gains one promise and one example: once Ctrl C, SIGTERM or a closed
terminal stopped a command, the command waits at most 15 seconds for its engine to close. A close
that runs over is given up: the engine lock is released, a `--debug` line says so, and the process
ends with the stop's code. Every other promise and example stays as it was. No test was removed or
weakened.

## Why

`halonic run` on a model that never answers ended the run at Ctrl C, then waited in
`engine.close()` for the model call, up to the adapter's own 10 minute limit. After a closed
terminal, the process kept the engine lock, so the next run was refused with exit 5. #1823
(HAL-5216) aborts the model call itself; this is the backstop for whatever else a close can hang
on, such as a connector call, which still runs to its end.

The bound is 15 seconds: a harness program that is told to stop gets 10 seconds to exit
(`exitGraceMs` in the harness kit), and 5 seconds more covers the scheduler's last write and
removing the run's program copies. A model call aborts at once, so a close that runs this long
hangs. A second Ctrl C still ends the process at once.

`main.ts` now ends the process once a stopped command has returned and its output is written, as
the second Ctrl C already does, so a step left running can't keep it open.

## Covers

- cli.local-engine-lock
