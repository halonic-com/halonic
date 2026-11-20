# cli.sandbox-kept-grants

- Status: active
- Since: unreleased
- Source: HAL-6780, after HAL-6256; `sandbox-srt.kept-grants`, `agent-host.sweep-lock`

The CLI shall make every srt sandbox it opens sessions in (harness runs, a run's workspace connectors, local integrations) record each session's folders in this process's kept-grant record in the profile (`agent-host/kept-grants`) before srt grants them, so the sweep of a Studio agent host or of another CLI process on the same profile never takes the kept Windows grant of a live CLI session, however many CLI processes run. On Windows, the harness sandbox shall try to take the profile's host lock (`agent-host/host.lock`, the agent host's) when it opens its first session, and only while it holds the lock shall it sweep the kept grants inside the harness temp root, the proposal worktrees and the run copies; it shall hold the lock until the harness host closes. When another live process holds the lock, or it can't be taken, the CLI shall open its sessions without a sweep and say why in a `--debug` line. A command that opens no session shall not take the lock, and on Linux and macOS the CLI shall never take it.

## Examples

- Given Windows and a profile whose host lock nobody holds,
  when the first harness session opens,
  then the CLI holds the lock, the sessions open in a sandbox that sweeps the three folders, and the lock is gone once the harness host closes.
- Given Windows and a Studio agent host that holds the profile's host lock,
  when a harness session opens,
  then it opens in a sandbox with no sweep root, the host's lock stays, and a `--debug` line says the lock is held.
- Given Windows and a harness host that opens no session,
  when it closes,
  then the lock was never taken.
- Given Linux or macOS,
  when a harness session opens,
  then the lock is never taken and the sandbox has no sweep root.
- Given a connector or integration session the CLI opens,
  when its sandbox is made,
  then it records its folders in the profile's kept-grant record and has no sweep root.
