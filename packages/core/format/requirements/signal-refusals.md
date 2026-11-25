# format.signal-refusals

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Safety": a signal only picks rules the runtime offers, and never holds a key)

The format shall refuse a signal file, with an error at the field's path and a message that never repeats a key:

- whose `rule.run` names a rule the runtime doesn't offer;
- with any key its schema doesn't know, at any depth, such as an `action`, a `host`, a `script` or a field named like a credential (`token`, `githubToken`);
- whose `wakeOn` names a state the PR watcher doesn't know;
- whose `windowMinutes` (`board-ask`) is outside 1 to 60, or whose `highFrom` (`task-effort`) is outside 1 to 5, or whose `jumpAhead` (`fast-track`) is below 8 or above 50, or another `fast-track` setting is outside its range, or whose `threshold` (`thin-spec`) is outside 0 to 1 or `inProgressLimit` (`rule-checks`) outside 1 to 100;
- with `value-looks-like-key` when its `id` or any text in `rule.with` holds a key by the rules of `format.keys-in-values`;
- larger than 16 KiB, with `file-too-large` before the file is parsed.

## Examples

- Given `rule: { run: shell.run }`, when it is parsed, then it fails at `rule.run`.
- Given `action: { run: paperclip.task }` at the top, `host:` in `rule.with` or `script:` in `rule`, when it is parsed, then it fails with `unrecognized_keys` there.
- Given `token:` at the top or `githubToken:` in `rule.with`, when it is parsed, then it fails with `unrecognized_keys` there.
- Given `wakeOn: [deploy]`, when it is parsed, then it fails at `rule.with.wakeOn[0]`.
- Given a `board-ask` signal with `wakeOn` or `windowMinutes: 600`, or a `task-effort` signal with `effort: max`, when it is parsed, then it fails at `rule.with` or `rule.with.windowMinutes`.
- Given a `fast-track` signal with `labelAdder` or `jumpAhead: 2`, when it is parsed, then it fails at `rule.with` or `rule.with.jumpAhead`.
- Given a `thin-spec` signal with `threshold: 2` or `clarifier: pm`, or a `rule-checks` signal with `checks: [workload]`, when it is parsed, then it fails at `rule.with.threshold` or `rule.with`.
- Given a signal whose id, from its file name, is an AI provider key in lowercase, when it is parsed, then it fails with `value-looks-like-key` at `id`, and the message doesn't hold the key.
- Given a signal file of 16 KiB and one byte, when it is parsed, then it fails with `file-too-large` and nothing else.
