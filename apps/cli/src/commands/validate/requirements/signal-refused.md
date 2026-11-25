# cli.commands.validate.signal-refused

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Safety"): a signal only picks rules the runtime offers, and never holds a key

When `halonic validate` checks a workspace with a signal file (`library/signals/<id>.signal.yaml`) that `format.signal-refusals` refuses, because it names a rule the runtime doesn't offer, names an action, holds a field named like a key or gives a rule a setting it doesn't know, it shall list an error on that file and exit 1. A signal file that passes shall add no problem.

## Examples

- Given `library/signals/watcher.signal.yaml` with `rule: { run: shell.run }`, `action: { run: paperclip.task }` or `token: abc`,
  when `halonic validate` is run,
  then it lists an error on that file and exits 1.
- Given `rule: { run: board-ask, with: { wakeOn: [ci-red] } }`, `rule: { run: task-effort, with: { effort: max } }`, `rule: { run: fast-track, with: { labelAdder: someone } }`, `rule: { run: thin-spec, with: { clarifier: pm } }` or `rule: { run: rule-checks, with: { checks: [workload] } }`,
  when `halonic validate` is run,
  then it lists an error on that file and exits 1.
- Given the same file with `rule: { run: pr-watcher }` only, or `board-ask`, `task-effort`, `fast-track`, `thin-spec` or `rule-checks` with settings they know,
  when `halonic validate` is run,
  then it exits 0.
