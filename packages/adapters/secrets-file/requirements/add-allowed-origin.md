# secrets-file.add-allowed-origin

- Status: active
- Since: unreleased
- Source: HAL-11873 (step B (c) of HAL-11343); builds on `secrets-file.store`

The file secret store shall add one origin to a stored key's list of allowed origins in a single locked step, keeping the others, so two callers never lose each other's change. It shall store the origin as its scheme, host and port, and answer what it did: `added`, `already-allowed` (nothing is written), `no-key` (no secret is stored under the name, or the name breaks the rule), `full` (the list already holds the most it may) or `bad-address` with the reason, `not-an-address` or `has-user-info`. It shall write nothing for any answer but `added`, and never put a value or an address in an error.

## Examples

- Given a stored key with no list,
  when `https://gateway.example.com/v1` is added,
  then it answers `added` with `https://gateway.example.com`, and the key's list holds that one origin.
- Given a stored key whose list holds that origin,
  when the same address is added,
  then it answers `already-allowed` and the file is unchanged.
- Given two additions at once for one key,
  when both finish,
  then the list holds both origins.
- Given `https://user@gateway.example.com`,
  when it is added,
  then it answers `bad-address` with `has-user-info`.
