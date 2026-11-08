# ports.read-only-sides

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: secrets are split into read-only configured secrets and a writable token store, and a cloud deployment gets a definition store without write methods

The `Secrets` and `DefinitionSource` ports shall offer no way to write, so a deployment that hands out only those can't have its configured secrets or definitions changed through them. Writing goes through the separate `TokenStore` and `DefinitionStore` ports.

## Examples

- Given a `Secrets`,
  when code calls `set` on it,
  then it doesn't compile.
- Given a `DefinitionSource`,
  when code calls `write` or `remove` on it,
  then it doesn't compile.
- Given a `DefinitionStore`,
  when it is passed where a `DefinitionSource` is expected,
  then it compiles.
