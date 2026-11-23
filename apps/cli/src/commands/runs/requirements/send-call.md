# cli.commands.runs.send-call

- Status: active
- Since: unreleased
- Source: HAL-16382, a follow-up from HAL-16338 agreed by Liam; the words build on `runs send`'s (`cli.commands.runs.send`)

The command `halonic runs send <run-id> <event> --call <id>` shall send the event only for the approval of that call, through `RunEvents.sendEvent` (`app.run-send-named-call`), whether or not an older approval waits. When the run no longer waits on that approval, it shall stop with "someone answered that approval first." and the way to see the run (`conflict`), and send nothing. When the run never asked for an approval of that call, it shall stop with "it never asked for your approval of call <id>." and the way to see the run (`not_found`), and send nothing. Where `halonic run`, `halonic runs show` and `halonic runs send` end a run waiting for tool approvals, each "! Waiting for your approval" line shall end with the call's id, "(call <id>)", and the way to answer shall name the oldest call after `--call`, so the same command typed twice is refused instead of answering the next approval. When more than one approval waits, the line under the way to answer shall say "To answer another one, use --call with the call id from its line."

## Examples

- Given run 09d9a0 waiting on the approvals of calls `call-1` (gmail\_\_send) and `call-2` (gmail\_\_delete),
  when `halonic runs show 09d9a0` is run,
  then it ends with "! Waiting for your approval: writer wants to use gmail\_\_send (call call-1)", the same line for `call-2`, "Answer with: halonic runs send 09d9a0 approve --call call-1 (or reject)" and "To answer another one, use --call with the call id from its line."
- Given that run, after `call-2` was answered,
  when `halonic runs send 09d9a0 approve --call call-2` is run,
  then it prints "✕ Couldn't send approve to run 09d9a0: someone answered that approval first.", exits 5, and sends nothing.
- Given that run,
  when `halonic runs send 09d9a0 approve --call call-9` is run,
  then it prints "✕ Couldn't send approve to run 09d9a0: it never asked for your approval of call call-9.", exits 4, and sends nothing.
- Given that run,
  when `halonic runs send 09d9a0 approve --call call-2` is run,
  then it prints "✓ Sent approve to run 09d9a0. Support reply goes on." and the run goes on with `approve` for `call-2`.
