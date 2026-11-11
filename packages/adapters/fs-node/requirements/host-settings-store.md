# fs-node.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API, design on HAL-6159, reviewed on HAL-6216); `HostSettingsStore` port v1; the profile stores' file rules (Julian, HAL-2927; Liam, HAL-2985)

The file store of the settings kept where Halonic runs shall keep them as one JSON file, `host.json`, holding `{"version":1,"values":{…}}`, in the folder it is given, which sits in the user's profile. It shall create the folder with mode `700` and the file with mode `600`, and write through a temporary file and a rename, removing the temporary file when the write or the rename fails. Saves through one store shall run one at a time, so saves made at once all land. A folder that doesn't exist yet shall read as none saved, and reading shall create nothing. The file shall be read with `readSavedHostSettings` and changed with `changeSavedHostSettings`, so a file that isn't JSON, isn't an object, or whose `values` isn't an object reads as none saved, and a save keeps keys and fields it doesn't know. The first save over a file that can't be parsed shall rename it to `host.json.broken` first, replacing an older one. A file that is a symbolic link, a hard link or not a plain file shall make `read` throw with an error that names the file; a save shall replace the link, not write through it. A file that can't be read for another reason shall make a save throw and change nothing.

`watch` shall create the folder, private, watch it, and call the listener only for a change to `host.json`, a change the system doesn't name, or a failed watch.

## Examples

- Given a saved turn limit of 20,
  when the folder is read,
  then it holds only `host.json`, with mode `600`, holding `{"version":1,"values":{"assistant.turn-limit":20}}`.
- Given a `host.json` that holds `{"version":1,"values":[16]}`,
  when the turn limit 24 is saved,
  then `host.json.broken` holds that text and `host.json` holds only the turn limit.
- Given a `host.json` that is a link to a file in a workspace,
  when it is read,
  then it throws, and a save replaces the link without changing the file it pointed to.
- Given a watch,
  when the folder reports `host.json.0b6c.tmp` and `notes.txt`,
  then the listener isn't called; when it reports `host.json`, it is.
