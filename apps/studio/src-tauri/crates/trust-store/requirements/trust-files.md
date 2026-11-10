# studio.src-tauri.crates.trust-store.trust-files

- Status: draft
- Since: 0.1.0
- Source: HAL-2612 (the `fs-tauri` trust store); `fs-node.trust-store-files` and `contracts.trust-store`, which it matches

The shell's trust store shall keep each trust record as `FileTrustStore` in `fs-node` keeps it: one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the record's location as UTF-16 code units (little-endian) and `.json`, with the location as the file's first key, written through a temporary file and a rename, the folder with mode `700` and each file with mode `600`. It shall read the records `fs-node` writes and write records `fs-node` reads. It shall keep the `TrustStore` contract: locations compared exactly as given, one record per location, records listed in UTF-16 code-unit order of their locations, a folder that doesn't exist read as empty, and other files in the folder left alone. When a record can't be read, or doesn't start with the location it is for, `get` shall fail naming the location; `list` shall fail naming the location when the file starts with the location it is named for, and naming the file otherwise. A record `fs-node` wrote for a location with a lone surrogate, which Windows allows and a Rust string can't hold, `list` shall leave out and report by its file, and list the other records; it shall never read it as the record for another location. `revoke` shall delete a record without reading it, and a grant shall refuse a record that isn't an object with a text `location`.

## Examples

- Given a grant for `/Workspaces/Café`,
  when the folder is read,
  then it holds `a47c4600542f1f0e56aedc0ccf0d69ab2aaca89accf3ea63a7d0cd172535da7e.json`, starting with `"location": "/Workspaces/Café"`.
- Given the records `fs-node` wrote for `/workspaces/acme` and `/Workspaces/Café`,
  when they are listed,
  then the list is `/Workspaces/Café`, then `/workspaces/acme`, with every field.
- Given records for `/a\u{ffff}` and `/a\u{10000}`,
  when they are listed,
  then `/a\u{10000}` comes first, as JavaScript sorts them.
- Given the record for `/workspaces/acme` copied over the file for `/workspaces/zeta`,
  when the records are listed,
  then it fails naming the file, and `/workspaces/acme` still reads.
- Given the records `fs-node` wrote for `/workspaces/acme`, `/Workspaces/Café` and `/a\uD800`,
  when they are listed,
  then the list is `/Workspaces/Café`, then `/workspaces/acme`, and the file for `/a\uD800` is reported as left out.
- Given the file for `/workspaces/zeta` starting with `"location": "/workspaces/acme"` and ending with a second `"location": "/workspaces/zeta"`,
  when `/workspaces/zeta` is read,
  then it fails naming `/workspaces/zeta`.
