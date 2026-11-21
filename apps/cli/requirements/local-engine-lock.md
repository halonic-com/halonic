# cli.local-engine-lock

- Status: active
- Since: 0.1.0
- Source: HAL-4032 (Liam's review of the engine host, HAL-4026); naming the command that holds the engine, HAL-14299 (C340 C46, team wording built on C336/C337)

While the CLI's engine of a workspace (`cli.local-engine`) is open, it shall be the only engine on that workspace, so two engines never deliver the same timer and a model call never runs twice. It shall hold `engine.lock` in the workspace's folder in the profile with `holdLock` (`fs-node.held-lock`), and release it when it is closed, after its scheduler. Each command that opens an engine (`run`, `runs send`, `routines watch`, `serve`) shall name itself in the lock as its holder. When another engine on this computer holds the lock, opening one shall fail with a `conflict` error that names that engine's process, and the command when the lock names one of these: "halonic routines watch is running for this workspace (process 4242)." The fix shall be "Stop it with Ctrl C there, then run again." when that command runs until it is stopped (`routines watch`, `serve`), and "Wait until it has finished or stop it, then run again." otherwise. A lock that names no command, or text that isn't one of these, shall name only the process: "Another Halonic engine is open on this workspace (process 4242)." The lock left by an engine whose process ended shall be taken over. When the lock is lost all the same, the engine shall report it and close. When a command that was stopped (`cli.stop`) closes its engine and the close hasn't ended 15 seconds after the stop, such as on a model call that doesn't stop, the command shall release the lock without waiting for the close, say so in a `--debug` line, and end with the stop's code; the process shall end then, whatever the close left running (HAL-6677).

## Examples

- Given an open engine on the Acme example,
  when a second engine is opened on it,
  then it fails with `conflict`: "Another Halonic engine is open on this workspace (process 4242)."
- Given `halonic routines watch` open on a workspace,
  when `halonic run support-reply` is run on it,
  then it stops with "✕ Couldn't run support-reply: halonic routines watch is running for this workspace (process 4242).", the fix "Stop it with Ctrl C there, then run again." and exit 5.
- Given that engine closed,
  when another engine is opened on the workspace,
  then it opens.
- Given an engine lock left by a process that has ended,
  when an engine is opened on the workspace,
  then it takes the lock over and opens.
- Given `halonic run support-reply` on a model that never answers and doesn't stop when asked,
  when the user presses Ctrl C once, or closes the terminal,
  then the command ends with "Stopped." and code 130, or 129, at most 15 seconds later, and the next engine on the workspace opens.
