# toolscript-check.profile-rules

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, sections 1.2 and 1.3; task HAL-17568

When a ToolScript is checked, the checker shall refuse it for each break of the profile rules P1–P7 or of the header schema, with a message that starts with the rule (such as `P4: eval is not allowed in a ToolScript`) and the line and column, reading only the syntax tree and running nothing. A banned name counts in value positions only, including a local binding with that name, and not as a property name or in a type.

## Examples

- Given a ToolScript whose `run` calls `eval("1")`,
  when it is checked,
  then the only problem is `P4: eval is not allowed in a ToolScript`.
- Given a ToolScript that reads `note.self` and builds `{ fetch: "a" }`,
  when it is checked,
  then it passes.
- Given a ToolScript whose `run` has complexity 16,
  when it is checked,
  then the only problem is `P6: function run has complexity 16, at most 15`; at 15 it passes.
