# format.signal-file

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Step 2" and "Safety")

When `parseFile` reads a `library/signals/<id>.signal.yaml` at the workspace root, the format shall take its `id` from the file name when the file has none, require a `rule` that names one of the rules the runtime offers under `run` (`pr-watcher`, `board-ask`, `task-effort`, `fast-track`, `thin-spec` and `rule-checks`) with that rule's settings under `with`, and fill in `version` (1), `dryRun` (`false`) and every setting the file leaves out with the value that keeps today's behaviour. For `pr-watcher` the settings are `done` (default `true`), whether it marks tasks done, and `wakeOn`, the states that wake a task's holder: any of `ci-red`, `conflict`, `retargeted`, `review`, `approved`, `merged` and `held` (default all of them). For `board-ask` they are `windowMinutes` (1 to 60, default 12), how far back a comment counts as a new ask, and `wake` (default `true`), whether a new ask wakes the Board Checker. For `task-effort` they are `highFrom` (1 to 5, default 4), the easiest difficulty that runs at high, and `highAfterSendBack` (default `true`). For `fast-track` they are `reviewEscalateMinutes` (5 to 120, default 15), `enqueueAfterMinutes` (1 to 60, default 10), `queueSlowMinutes` (10 to 240, default 30) and `jumpAhead` (8 to 50, default 8), how many pull requests ahead before a jump. For `thin-spec` they are `threshold` (0 to 1, default 0.5), the score above which a task is flagged, `upTo` (1 to 5, default 4), the hardest difficulty it checks, `newForHours` (1 to 168, default 24), how long a task counts as new, and `doneWhen` (default `true`), whether a missing checkable Done when line counts. For `rule-checks` they are `shortestMonitorMinutes` (1 to 120, default 15) and `inProgressLimit` (1 to 100, default 10). `signalRuleInfo` shall say what each rule does and whether it writes.

## Examples

- Given a signal with an id and `rule: { run: pr-watcher }`, when it is parsed, then `version` is 1, `dryRun` is `false`, `done` is `true` and `wakeOn` lists all seven states.
- Given `with: { done: false, wakeOn: [ci-red, conflict] }` and `dryRun: true`, when it is parsed, then those values are kept.
- Given a file `nightly.signal.yaml` without an id, when it is parsed, then its id is `nightly`.
- Given `rule: { run: board-ask }` or `rule: { run: task-effort }`, when it is parsed, then `windowMinutes` is 12 and `wake` is `true`, or `highFrom` is 4 and `highAfterSendBack` is `true`; given `with: { highFrom: 3 }`, `highFrom` is 3.
- Given `rule: { run: fast-track }`, when it is parsed, then `reviewEscalateMinutes` is 15, `enqueueAfterMinutes` 10, `queueSlowMinutes` 30 and `jumpAhead` 8; given `with: { jumpAhead: 12 }`, `jumpAhead` is 12.
- Given `rule: { run: thin-spec }` or `rule: { run: rule-checks }`, when it is parsed, then `threshold` is 0.5, `upTo` 4, `newForHours` 24 and `doneWhen` `true`, or `shortestMonitorMinutes` is 15 and `inProgressLimit` 10.
- Given the rule list, when it is read, then it is `pr-watcher`, `board-ask`, `task-effort`, `fast-track`, `thin-spec` and `rule-checks`; all write but `rule-checks`.
