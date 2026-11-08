# ports.definition-store-private-entries

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan section 11 (the store layer refuses `.git`, `.studio`, `.env` and symlinks), with the stricter wording decided on HAL-181

Every `DefinitionSource` and `DefinitionStore` method shall refuse, with a `RangeError`, a path with a private segment, and any symbolic link, Windows junction or other reparse point in any segment, wherever it points. A segment is private when, after removing the code points HFS+ ignores, ignoring case and removing trailing dots and spaces, it is `.git`, `.studio`, `.env` or `.envrc`, or starts with `.env.`; and, whatever its name, when it holds a `:` or a `~` followed by a digit. `list()` shall leave these entries out instead of throwing. The `definition-store` contract suite checks every adapter against this.

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
- Given a store,
  when `read(".env::$DATA")`, `read(".git::$INDEX_ALLOCATION/config")`, `read("ENV~1.LOC")`, `read("GI3F2A~1/config")` or `read(".envrc")` is called,
  then it throws a `RangeError`.
- Given a store,
  when `read(".g\u200Cit/config")` is called (a zero-width non-joiner inside `.git`),
  then it throws a `RangeError`.
- Given a folder store where `hubs/shared` is a symlink or a Windows junction to another folder,
  when `read("hubs/shared/a.yaml")` is called,
  then it throws a `RangeError`, and `list()` leaves out everything under `hubs/shared`.
