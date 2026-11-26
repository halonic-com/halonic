# toolscript.header-steps

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, sections 1.1 and 4 (`steps`); task HAL-17567

When a ToolScript header is checked, the toolscript package shall take `steps` only as the same blocks a `halonic.stepper-request/1` takes, and shall refuse a ToolScript that has both `steps` and a `run` function, and one that has neither.

## Examples

- Given a header with `steps` and a script that exports `run`,
  when it is checked,
  then it is refused with "steps and run can't be used together".
- Given a header whose first block has the kind `delete`,
  when it is checked,
  then it is refused with a reason naming `steps`.
