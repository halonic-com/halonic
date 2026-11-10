# cli.local-engine-lock

- Status: active
- Since: 0.1.0
- Source: HAL-4032 (Liam's review of the engine host, HAL-4026)

While the CLI's engine of a workspace (`cli.local-engine`) is open, it shall be the only engine on that workspace, so two engines never deliver the same timer and a model call never runs twice. It shall hold `engine.lock` in the workspace's folder in the profile with `holdLock` (`fs-node.held-lock`), and release it when it is closed, after its scheduler. When another engine on this computer holds the lock, opening one shall fail with a `conflict` error that names that engine's process, with the fix "Wait until it has finished or stop it, then run again." The lock left by an engine whose process ended shall be taken over. When the lock is lost all the same, the engine shall report it and close.

## Examples

- Given an open engine on the Acme example,
  when a second engine is opened on it,
  then it fails with `conflict`: "Another Halonic engine is open on this workspace (process 4242)."
- Given that engine closed,
  when another engine is opened on the workspace,
  then it opens.
- Given an engine lock left by a process that has ended,
  when an engine is opened on the workspace,
  then it takes the lock over and opens.
