# ports.definition-store-private-entries

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan section 11 (the store layer refuses `.git`, `.studio`, `.env` and symlinks), with the stricter wording decided on HAL-181

Every `DefinitionSource` and `DefinitionStore` method shall refuse, with a `RangeError`, a path with a segment named `.git`, `.studio` or `.env`, or starting with `.env.`, matched in any case, with trailing dots or spaces removed and as 8.3 short names, and shall refuse any symbolic link wherever it points. `list()` shall leave these entries out instead of throwing. The `definition-store` contract suite checks every adapter against this.

## Examples

- Given a store,
  when `read(".git/config")`, `read("hubs/.GIT/config")` or `read(".env.local")` is called,
  then it throws a `RangeError` before touching storage.
- Given a store on Windows,
  when `write(".env. ", "x")` or `read("GIT~1/config")` is called,
  then it throws a `RangeError`.
- Given a folder store where `agents/link.yaml` is a symlink to `agents/real.yaml` inside the root,
  when `read("agents/link.yaml")` is called,
  then it throws a `RangeError`, and `list("agents")` returns only `agents/real.yaml`.
- Given a store that holds `.studio/trust.json` and `workflows/a.yaml`,
  when `list()` is called,
  then it returns `["workflows/a.yaml"]`.
