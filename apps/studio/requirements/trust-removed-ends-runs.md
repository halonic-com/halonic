# studio.trust-removed-ends-runs

- Status: draft
- Since: unreleased
- Source: HAL-13678 (C210 TR2, Kim's check of HAL-12799; decided by the team with Sofia as designer, HAL-2282); `studio.untrusted-starts-nothing`, `engine.end-stopped-runs`, `fs-tauri.engine-lock`

When the Studio's engine closes because the workspace's trust was removed while it was open (`studio.untrusted-starts-nothing`), it shall end each run it stopped right then, rather than when an engine next opens on the workspace, which an untrusted workspace never does: each run that was going, and each parent waiting on one, gets `run.failed` with `reason: "interrupted"` and the typed cause `{ kind: "denied", code: "workspace.trust-removed" }` (`engine.end-stopped-runs`). The run card, the Runs list, Home and the run page then show it as failed, not as running, and opening the workspace again shows the same. It shall hold the workspace's engine lock from the close until those runs are ended, so no other engine, the CLI's or another window's, starts a run in between that it would end while it is going, and an engine it opens again in that time shall open only after they are ended. When another process took the lock over before the ending (`fs-tauri.engine-lock`), it shall end no run, because the runs may be that process's.

## Examples

- Given a trusted workspace whose run of Support reply is held in its model call,
  when the person removes the trust,
  then the run is failed with `reason: "interrupted"` and the cause `workspace.trust-removed`, and no run is `running`.
- Given the same run, and another engine that takes the workspace's lock as soon as it is free,
  when the person removes the trust,
  then the Studio gives the lock back only after the run is failed.
- Given the same run, and the trust given back while the engine closes,
  when the Studio opens the engine again,
  then it takes the lock only after the run is failed, and the run stays failed.
- Given the same run, and another process that takes the lock over while the engine closes,
  when the person removes the trust,
  then the run is left as it is and the Studio gives the lock back once.
