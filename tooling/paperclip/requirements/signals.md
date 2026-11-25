# paperclip.signals

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Step 2" and "Safety"; Liam's design on HAL-17772)

When the plugin reads a workspace snapshot's `signals` list, it shall plan each rule it has a pure rule for (`pr-watcher`, `board-ask`, `task-effort`, `fast-track`, `thin-spec` and `rule-checks`) with the settings of the one signal that names it, or with the defaults that keep today's behaviour when none does. A signal the format refuses (`format.signal-refusals`), or a second signal for the same rule, shall turn that rule off, never on, and a `signals` value that isn't a list shall turn every rule off, each with a log line that names the problem codes and paths and never a value. A signal naming a rule the runtime doesn't offer shall run nothing and change no other rule.

When a pass carries out a rule's actions, it shall do so only through the runtime's executors (one wake per task with all of its new states, and a task update), at most once per task, pull request, head and action, and shall forget the keys of tasks the rule no longer reads. A writing signal from a file that is new or changed since the last pass, or that sets `dryRun`, shall run as a dry run: it logs what it would do and writes nothing. The built-in defaults need no dry pass.

## Examples

- Given a snapshot without `signals`, when the plugin loads them, then `pr-watcher` runs with `done` on and every wake state, from its defaults.
- Given a snapshot without `signals`, when the plugin loads them, then `board-ask` runs with a 12-minute window and its wake on, and `task-effort` with high from D4 and after a send-back; given a `task-effort` signal with `highFrom: 5`, it takes that and `pr-watcher` keeps its defaults.
- Given a snapshot without `signals`, when the plugin loads them, then `fast-track` runs with 15, 10 and 30 minutes and a jump past 8 ahead; given a `fast-track` signal with `jumpAhead: 12` it takes that, and with `jumpAhead: 3` `fast-track` is off.
- Given a snapshot without `signals`, when the plugin loads them, then `thin-spec` runs with a 0.5 threshold up to D4, and `rule-checks`, which doesn't write, with a 15-minute monitor gap and a limit of 10 in progress.
- Given a `pr-watcher` signal with an `action`, a `githubToken` setting or a key as its id, when the plugin loads it, then `pr-watcher` is off and the log names `unrecognized_keys` or `value-looks-like-key` and the path.
- Given a signal for `shell.run`, when the plugin loads it, then nothing runs for it and `pr-watcher` keeps its defaults.
- Given two `pr-watcher` signals, or `signals` as a map, when the plugin loads them, then `pr-watcher` is off.
- Given a new `pr-watcher` signal file and two wakes and a done to carry out, when the first pass runs, then it writes nothing and logs three "would" lines; the next pass marks the task done and wakes the other once with both states, and a third writes nothing again.
- Given a live signal that changes, or sets `dryRun`, when a pass runs, then it writes nothing.
- Given no signal file, when the first pass runs, then it writes.
