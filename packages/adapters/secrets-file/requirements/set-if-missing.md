# secrets-file.set-if-missing

- Status: active
- Since: unreleased
- Source: HAL-13855 (the token key Halonic makes for itself); builds on `secrets-file.store`

The file secret store shall store a value under a name only when nothing is stored there yet, in one step under the file's write lock, and answer the value stored afterwards: the new one, or the one already there. It shall never replace a stored value, so of two programs that call it at the same moment, each with its own value, both get the first one back and the file holds only that one. It checks the name and the value as `set` does, and never puts a value in an error.

## Examples

- Given an empty profile,
  when `token-key` is stored if missing,
  then the file holds it and the call answers it.
- Given a stored `token-key`,
  when another value is stored if missing,
  then the call answers the stored value and the file is unchanged.
- Given several programs that store a different `token-key` if missing at the same moment,
  when all finish,
  then every one answers the same value, and the file holds that value.
