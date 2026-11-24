# engine.run-effort-tags

- Status: active
- Since: unreleased
- Source: HAL-17252 (token phase 1c), following HAL-16876's table with two levels only

The engine shall give one rule from a task's labels and whether a reviewer sent it back to the effort of the run that works on it, so Studio and Paperclip read the same table: `low` for a task tagged `D1`, `D2` or `D3`, and `default` for every other task. A task tagged `opus-only`, `design`, one of the opus-only areas (`security`, `trust`, `sandbox`, `schema`, `secrets`, `sign-in`, `oauth`, `keychain`) or `D4` or harder, and a task sent back, shall get `default` even when it also has a low difficulty tag. A task without a difficulty tag, or with only unknown tags, shall get `default`. Case and surrounding spaces in a label shall not matter.

## Examples

- Given a task tagged `D2`, when its run's effort is chosen, then it is `low`.
- Given a task tagged `D2` and `sandbox`, or `D1` and sent back, or `D3` and `D4`, when its run's effort is chosen, then it is `default`.
- Given a task with no tags, or only the tag `docs`, when its run's effort is chosen, then it is `default`.
