# toolscript.header-strict

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 4; task HAL-17567

When a ToolScript header is checked, the toolscript package shall take it only when it holds exactly the keys the header format names, at every level, and every text input has an anchored pattern or a fixed list of values. Otherwise it shall return every reason, each naming its place.

## Examples

- Given the invented header `acme.sync-release-variables` with an extra key `runtime`,
  when it is checked,
  then it is refused with a reason naming `runtime`.
- Given an input of type `string` without a `pattern`,
  when it is checked,
  then it is refused.
