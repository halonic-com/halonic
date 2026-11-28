# cli.local-engine-lock

- Status: active
- Since: 0.1.0
- Source: HAL-4032 (Liam's review of the engine host, HAL-4026); naming the command that holds the engine, HAL-14299 (C340 C46, team wording built on C336/C337); `run` handing its run to `serve`, HAL-19396 (option A, decided by Liam on the task; the started line after Nina's words check); a trust check that fails, a late answer and a started line that promises no question, HAL-21151 (Julian's review of #6949, decided by Liam on the task)

While the CLI's engine of a workspace (`cli.local-engine`) is open, it shall be the only engine on that workspace, so two engines never deliver the same timer and a model call never runs twice. It shall hold `engine.lock` in the workspace's folder in the profile with `holdLock` (`fs-node.held-lock`), and release it when it is closed, after its scheduler. Each command that opens an engine (`run`, `runs send`, `routines watch`, `serve`) shall name itself in the lock as its holder. When another engine on this computer holds the lock, opening one shall fail with a `conflict` error that names that engine's process, and the command when the lock names one of these: "halonic routines watch is running for this workspace (process 4242)." The fix shall be "Stop it with Ctrl C there, then run again." when that command runs until it is stopped (`routines watch`, `serve`), and "Wait until it has finished or stop it, then run again." otherwise. A lock that names no command, or text that isn't one of these, shall name only the process: "Another Halonic engine is open on this workspace (process 4242)." When the lock names `serve` and `halonic run` has no `--event`, `--harness` or `--follow`, `run` shall not refuse: it shall ask that `serve`, over its console channel (`server.device-pairing`), to start the run on its own engine, which checks it as a run started from the served Studio (trust, the live version, the sandbox), and end with exit 0 and "✓ Started in the running Studio as run 01jd8q." and the line "See where it is: halonic runs show 01jd8q"; its `--json` shall give the run's id. Before those lines it shall give the lines a run it starts itself gives first: saved changes that aren't live (`cli.run-live-version`) and each agent that runs without the sandbox (`cli.run-sandbox-gate`). When `serve` refuses the start, `run` shall fail with `conflict` and `serve`'s reason, which is only ever a sentence of Halonic's own checks, and nothing runs; when the start fails for any other reason, including a trust check that fails, `serve` shall keep its text for its `--debug` lines, and `run` shall fail with `unavailable`: "halonic serve couldn't start the run." and the fix "Start halonic serve with --debug to see why, then run again." An input whose request is longer than the console channel takes (4 KB) shall fail with `conflict`, "The input is too big to hand to the running Studio (over 4 KB). Nothing ran." and the fix "Stop halonic serve with Ctrl C there, then run again." When `serve` takes the request but closes or gives no answer within 10 seconds, it may have started the run, so `run` shall fail with `unavailable`: "halonic serve didn't answer in time, so the run may have started there." and the fix "See whether it did before you run it again: halonic runs list", never the refusal, whose fix would run it twice. When the console can't be reached (Windows, or no `serve` listening on it) or `serve` doesn't know the request, the refusal above shall stand. The lock left by an engine whose process ended shall be taken over. When the lock is lost all the same, the engine shall report it and close. When a command that was stopped (`cli.stop`) closes its engine and the close hasn't ended 15 seconds after the stop, such as on a model call that doesn't stop, the command shall release the lock without waiting for the close, say so in a `--debug` line, and end with the stop's code; the process shall end then, whatever the close left running (HAL-6677).

## Examples

- Given an open engine on the Acme example,
  when a second engine is opened on it,
  then it fails with `conflict`: "Another Halonic engine is open on this workspace (process 4242)."
- Given `halonic routines watch` open on a workspace,
  when `halonic run support-reply` is run on it,
  then it stops with "✕ Couldn't run support-reply: halonic routines watch is running for this workspace (process 4242).", the fix "Stop it with Ctrl C there, then run again." and exit 5.
- Given `halonic serve` running on the Acme example,
  when `halonic run support-reply --input examples/refund-question.json` is run on it,
  then `serve` starts the run, which waits in the served Inbox for the reply's approval, and `run` ends with "✓ Started in the running Studio as run 01jd8q." and exit 0.
- Given `halonic serve` running on the Acme example,
  when `halonic run support-reply --event approve` is run on it,
  then it stops with "✕ Couldn't run support-reply: halonic serve is running for this workspace (process 4242).", the fix "Stop it with Ctrl C there, then run again." and exit 5.
- Given `halonic serve` running on the Acme example and busy past 10 seconds before it answers a start,
  when `halonic run support-reply --input examples/refund-question.json` is run on it,
  then it stops with "✕ Couldn't run support-reply: halonic serve didn't answer in time, so the run may have started there." and the fix "See whether it did before you run it again: halonic runs list".
- Given that engine closed,
  when another engine is opened on the workspace,
  then it opens.
- Given an engine lock left by a process that has ended,
  when an engine is opened on the workspace,
  then it takes the lock over and opens.
- Given `halonic run support-reply` on a model that never answers and doesn't stop when asked,
  when the user presses Ctrl C once, or closes the terminal,
  then the command ends with "Stopped." and code 130, or 129, at most 15 seconds later, and the next engine on the workspace opens.
