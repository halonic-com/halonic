# fs-node.tool-approval-files

- Status: draft
- Since: 0.1.0
- Source: HAL-2210 step 3; `ToolApprovalStore` port v1; store rows I2, I5–I10, I12 and I13 of the HAL-2579 test cases. It becomes active with `ports.listed-tool-approval`.

The file tool approval store shall keep each source of each workspace in a folder of its own, named by the lower-case hex SHA-256 of `[location, source]` as JSON, as UTF-16 code units (little-endian). In it, each approval shall be one JSON file named by the SHA-256 of the tool's name and `.json`, starting with `"format": 1` and the key, and `waiting.json` shall hold the source's waiting versions. It shall create its folders with mode `700` and its files with mode `600`, and write every file through a temporary file and a rename while holding the source's lock, so waiting versions noted at once are all kept.

It shall fail closed:

- It shall refuse to read or write when its folder, as a real path, is the workspace asked about or inside it.
- It shall believe an approval file only when it is exactly as it writes it, with every part of the right kind, an `htl1:` fingerprint of 64 lowercase hex digits and the key the file is named for; otherwise `get` throws naming the tool, and `list` throws naming the tool, or the file when not even the tool can be read. It shall refuse to write an approval it couldn't read back.
- It shall never read or overwrite a file with a higher format or an `htl2:` (or later) fingerprint, which a newer Halonic wrote: reading such an approval and approving over it throw, noting a waiting version over such a waiting file throws, and approving or revoking leaves such a waiting file as it is.
- `revoke` shall delete an approval file without reading it.

A waiting file that can't be read shall be started again, as waiting versions only stop the host asking. `list` shall read only approval files and leave other files alone.

## Examples

- Given an approval for `lookup` of `notes` in `/workspaces/acme`,
  when the folder is read,
  then it holds one folder named by the SHA-256 of `["/workspaces/acme","notes"]`, with one file named by the SHA-256 of `lookup` that starts with `"format": 1` and the key.
- Given the store's folder at `<workspace>/.halonic/approvals`, or reached through a link into the workspace,
  when an approval of that workspace is read or written,
  then it is refused and the workspace stays empty.
- Given an approval file whose fingerprint is uppercase, which holds a key twice or a key Halonic doesn't write, or which holds another tool's key,
  when it is read,
  then `get` throws naming `lookup`, and `revoke` still deletes it.
- Given an approval file with `"format": 2` or an `htl2:` fingerprint,
  when it is read or `lookup` is approved again,
  then both throw saying a newer Halonic wrote it, the file is unchanged, and `revoke` deletes it.
- Given 12 tools noted as waiting at the same time,
  when `waiting.json` is read,
  then it holds all 12.
- Given a `waiting.json` that holds one tool twice,
  when a version of `lookup` is noted,
  then only that version is returned.
