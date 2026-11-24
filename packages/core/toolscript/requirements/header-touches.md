# toolscript.header-touches

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S14); task HAL-17567

When a user ToolScript header's `touches` is checked, the toolscript package shall take it only when each key is a capability in `uses` and each target template is built from `{input.name}` placeholders of declared, non-secret inputs, with `{input.name[]}` for a list input and no other braces. The same placeholder rule applies to header text in `steps`, `ui` and `guide`.

## Examples

- Given a template `{input.repos[]}` for the list input `repos`,
  when it is checked,
  then it is taken.
- Given a template `{input.missing}`,
  when it is checked,
  then it is refused, because no input has that name.
- Given a template `{input.token}` for a secret input,
  when it is checked,
  then it is refused.
