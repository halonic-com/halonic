# format.signal-file

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Step 2" and "Safety")

When `parseFile` reads a `library/signals/<id>.signal.yaml` at the workspace root, the format shall take its `id` from the file name when the file has none, require a `rule` that names one of the rules the runtime offers under `run` (today only `pr-watcher`) with that rule's settings under `with`, and fill in `version` (1), `dryRun` (`false`) and every setting the file leaves out with the value that keeps today's behaviour. For `pr-watcher` the settings are `done` (default `true`), whether it marks tasks done, and `wakeOn`, the states that wake a task's holder: any of `ci-red`, `conflict`, `retargeted`, `review`, `approved`, `merged` and `held` (default all of them). `signalRuleInfo` shall say what each rule does and whether it writes.

## Examples

- Given a signal with an id and `rule: { run: pr-watcher }`, when it is parsed, then `version` is 1, `dryRun` is `false`, `done` is `true` and `wakeOn` lists all seven states.
- Given `with: { done: false, wakeOn: [ci-red, conflict] }` and `dryRun: true`, when it is parsed, then those values are kept.
- Given a file `nightly.signal.yaml` without an id, when it is parsed, then its id is `nightly`.
- Given the rule list, when it is read, then it is `pr-watcher`, which writes.
