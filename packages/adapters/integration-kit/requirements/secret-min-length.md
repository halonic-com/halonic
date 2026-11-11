# integration-kit.secret-min-length

- Status: active
- Since: 0.1.0
- Source: HAL-5216

The kit shall refuse a secret value shorter than 8 UTF-8 bytes with `secret-too-short`, both when it places the secret in a request and when it reads the declared secrets for the filter, and shall then send nothing. The secret filter replaces every copy of a value in what the integration sees, so a shorter value would remove ordinary text, and where it was removed would give the value away.

## Examples

- Given a workspace whose `example-key` holds a 7-byte value,
  when the integration places it as a bearer token,
  then the kit refuses with `secret-too-short` and sends nothing.
- Given a value of four two-byte characters,
  when the kit checks it,
  then it is long enough.
