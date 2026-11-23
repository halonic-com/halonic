# paperclip.task-effort-rules

- Status: active
- Since: unreleased
- Source: HAL-16876; the effort decision note on HAL-16866, steps 2 and 3 (board approved step 1, 23 Nov)

When the task effort table is asked for a task's effort, the plugin shall answer `high` for a task tagged `opus-only` or with an opus-only area (`security`, `trust`, `sandbox`, `schema`, `secrets`, `sign-in`, `oauth`, `keychain`), `high` for a task tagged `D4` or `D5` and for a task with a difficulty tag that a reviewer sent back, `low` for any other task tagged `D1`, `D2` or `D3`, and nothing for a task with neither a difficulty tag nor an opus-only tag; it shall never answer `medium`, `xhigh` or `max`, and it shall read tags without regard to case or surrounding spaces, taking the hardest of several difficulty tags.

## Examples

- Given a task tagged `D2`,
  when the table is asked,
  then it answers `low`; tagged `d3 ` it also answers `low`.
- Given a task tagged `D2` and `sandbox`, or `D1` and `opus-only`,
  when the table is asked,
  then it answers `high`.
- Given a task tagged `D4`, or tagged `D2` and `D4`,
  when the table is asked,
  then it answers `high`.
- Given a task tagged `D3` that a reviewer handed back without an approval,
  when the table is asked,
  then it answers `high`.
- Given a task tagged only `docs`, or with no tags, sent back or not,
  when the table is asked,
  then it answers nothing.
