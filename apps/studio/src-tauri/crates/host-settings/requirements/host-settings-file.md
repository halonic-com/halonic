# studio.src-tauri.crates.host-settings.host-settings-file

- Status: draft
- Since: 0.1.0
- Source: HAL-6261 (PR 7d of the settings host API, design on HAL-6159); `fs-node.host-settings-store` and `contracts.host-settings-store`, which it matches; the golden cases, `packages/testing/contracts/src/golden/host-settings-limits.json`

The shell's host settings store shall keep the settings kept where Halonic runs as `FileHostSettingsStore` in `fs-node` keeps them: one JSON file, `host.json`, holding `{"version":1,"values":{…}}`, in the folder it is given, created with mode `700` (an existing one made `700` too), the file with mode `600`, written through a temporary file and a rename (on Windows tried again after 10, 20, 40, 80 and 160 ms while another program holds the file), the temporary file removed when the write or the rename fails. It shall allow exactly the keys the golden cases allow and refuse a save over 256 KiB of values, counted as compact JSON in UTF-8, saving nothing then. It shall read every golden saved text as the values it lists, a text that can't be parsed as none saved, and after a save hold what the golden case holds, keeping keys and fields it doesn't know; the first save over a text that can't be parsed shall keep it as `host.json.broken` first, replacing an older one. A folder that doesn't exist shall read as none saved, and reading shall create nothing. A `host.json` that is a symbolic link (on Windows a junction too), a hard link (on Unix only) or not a plain file, such as a named pipe, shall make a read fail naming the file, without waiting; a save shall replace the link, not write through it.

## Examples

- Given a saved turn limit of 20,
  when the folder is read,
  then it holds only `host.json`, with mode `600`, holding `{"version":1,"values":{"assistant.turn-limit":20}}`, indented by two spaces.
- Given a `host.json` that holds `{"values":[]}`,
  when the turn limit 24 is saved,
  then `host.json.broken` holds that text and `host.json` holds only the turn limit.
- Given a `host.json` that is a link to a file in a workspace,
  when it is read,
  then it fails as `unreadable`, and a save replaces the link without changing the file it pointed to.
- Given the key `assistant.turn_limit`,
  when it is saved,
  then it fails as `invalid_key` and nothing is created.
