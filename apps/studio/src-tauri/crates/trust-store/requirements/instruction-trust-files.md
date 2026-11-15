# studio.src-tauri.crates.trust-store.instruction-trust-files

- Status: draft
- Since: 0.1.0
- Source: HAL-10515 (the shell's `instruction_trust_*` commands, for HAL-10513); `fs-node.instruction-trust-store-files` and `contracts.instruction-trust-store`, which it matches

The shell's instruction trust store shall keep the instructions a person trusted for each agent as `FileInstructionTrustStore` in `fs-node` keeps them: one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the JSON of `[location, agent]` as UTF-16 code units (little-endian) and `.json`, with the location and the agent as the file's first keys, written through a temporary file and a rename, the folder with mode `700` (also when it was there already) and each file with mode `600`. It shall read the records `fs-node` writes and write records `fs-node` reads. When a record can't be read, is a link, or isn't exactly the fields of a record for the key asked for with every digest in `sha256:` form, `get` shall fail as `unreadable` naming the location, never answer `None`; a save shall still replace it. A folder that doesn't exist shall hold no records. `remove` shall delete a record without reading it, a link itself and never what it points to. A save shall refuse a record that isn't exactly such a record as `invalid_record`.

## Examples

- Given a save for the agent `coder` in `/workspaces/acme`,
  when the folder is read,
  then it holds `18525d8a6658f9fbcfe2589a2cab1098298926095cead866ac837bd2bc7b2beb.json`, starting with `"location": "/workspaces/acme"` and `"agent": "coder"`.
- Given the record for `coder` copied over the file for `writer`,
  when `writer` is read,
  then it fails as `unreadable`.
