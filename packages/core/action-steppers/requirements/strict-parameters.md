# action-steppers.strict-parameters

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2 and 2.2; task HAL-17517

When a stepper definition's parameters are parsed, the action-steppers package shall refuse a key the definition doesn't declare, a text that doesn't match its pattern, anchored to the whole value, or its enum, and any text that isn't one safe path segment (`.`, `..`, or a text holding `/`, `\`, `?`, `#`, `%`, `@`, `:` or a space), whatever the pattern says, so a parameter can't add a path segment, a query or another host.

## Examples

- Given a definition whose `repo` parameter has the pattern `^[A-Za-z0-9._-]{1,100}$`,
  when `repo` is `../secrets`, `app%2Fsecrets`, `app?x=1` or `https://evil.example/app`,
  then it is refused.
- Given the same definition,
  when the parameters carry an undeclared key `path`,
  then they are refused.
- Given the same definition,
  when `repo` is `app`,
  then the parameters are taken as they are.
