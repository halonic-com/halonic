# format.signal-file

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Step 2" and "Safety")

When `parseFile` reads a `library/signals/<id>.signal.yaml` at the workspace root, the format shall take its `id` from the file name when the file has none, require a `rule` that names one of the rules the runtime offers under `run` (`pr-watcher`, `board-ask` and `task-effort`) with that rule's settings under `with`, and fill in `version` (1), `dryRun` (`false`) and every setting the file leaves out with the value that keeps today's behaviour. For `pr-watcher` the settings are `done` (default `true`), whether it marks tasks done, and `wakeOn`, the states that wake a task's holder: any of `ci-red`, `conflict`, `retargeted`, `review`, `approved`, `merged` and `held` (default all of them). For `board-ask` they are `windowMinutes` (1 to 60, default 12), how far back a comment counts as a new ask, and `wake` (default `true`), whether a new ask wakes the Board Checker. For `task-effort` they are `highFrom` (1 to 5, default 4), the easiest difficulty that runs at high, and `highAfterSendBack` (default `true`). `signalRuleInfo` shall say what each rule does and whether it writes.

## Examples

- Given a signal with an id and `rule: { run: pr-watcher }`, when it is parsed, then `version` is 1, `dryRun` is `false`, `done` is `true` and `wakeOn` lists all seven states.
- Given `with: { done: false, wakeOn: [ci-red, conflict] }` and `dryRun: true`, when it is parsed, then those values are kept.
- Given a file `nightly.signal.yaml` without an id, when it is parsed, then its id is `nightly`.
- Given `rule: { run: board-ask }` or `rule: { run: task-effort }`, when it is parsed, then `windowMinutes` is 12 and `wake` is `true`, or `highFrom` is 4 and `highAfterSendBack` is `true`; given `with: { highFrom: 3 }`, `highFrom` is 3.
- Given the rule list, when it is read, then it is `pr-watcher`, `board-ask` and `task-effort`, which all write.
