# toolscript.header-audience

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, sections 3.2 (S7, S14) and 4; task HAL-17567

When a ToolScript header is checked, the toolscript package shall refuse an `agent` header that has a `secret` input, `touches` or `steps`, that has no `tool` name and description, or that raises the call limit above 50; and shall refuse a `user` header that has a `tool`.

## Examples

- Given an `agent` header with an input marked `secret`,
  when it is checked,
  then it is refused with a reason naming that input.
- Given a `user` header with a `tool` section,
  when it is checked,
  then it is refused.
