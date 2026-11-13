# integration-kit.current-secret-forms

- Status: active
- Since: 0.2.0
- Source: HAL-8613 (HAL-984 design, section 5 and attack case T4)

The kit shall give a filter outside it, such as the runner bridge's, the forms of the picked secrets and of every value the sign-in tokens list, read again each time the filter is used, and the same forms object until a listed value changes. Its stream step shall remove a value that begins in the bytes held back and ends in the next piece after the forms change.

## Examples

- Given a sign-in token listed after the forms were first asked for,
  then the next forms match it in every form a secret is matched in, and the earlier forms are unchanged.
- Given no change in the listed values,
  then the same forms object comes back.
- Given the stream step, a token listed between two pieces, and a token split across them,
  then the token is replaced.
