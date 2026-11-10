# studio.src-tauri.crates.trust-store.trust-files

- Status: draft
- Since: 0.1.0
- Source: HAL-2612 (the `fs-tauri` trust store); `fs-node.trust-store-files` and `contracts.trust-store`, which it matches

The shell's trust store shall keep each trust record as `FileTrustStore` in `fs-node` keeps it: one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the record's location as UTF-16 code units (little-endian) and `.json`, with the location as the file's first key, written through a temporary file and a rename, the folder with mode `700` and each file with mode `600`. It shall read the records `fs-node` writes and write records `fs-node` reads. It shall keep the `TrustStore` contract: locations compared exactly as given, one record per location, records listed in UTF-16 code-unit order of their locations, a folder that doesn't exist read as empty, and other files in the folder left alone. When a record can't be read, `get` shall fail naming the location; `list` shall fail naming the location when the file starts with the location it is named for, and naming the file otherwise. `revoke` shall delete a record without reading it, and a grant shall refuse a record that isn't an object with a text `location`.

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
