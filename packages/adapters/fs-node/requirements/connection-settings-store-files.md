# fs-node.connection-settings-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-3621, from HAL-230 ("allow sending" stored with each connection in the user's profile); `ConnectionSettingsStore` port v1

The file connection settings store shall keep each connector's settings as one JSON file in the folder it is given, named by the lower-case hex SHA-256 of the JSON of `[location, connector]` as UTF-16 code units (little-endian) and `.json`, with the location and the connector id as the file's first keys, and only the fields of the settings in it. It shall create the folder with mode `700` and each file with mode `600`, and write settings through a temporary file and a rename. A folder that doesn't exist yet shall hold no settings. When settings can't be read, hold another connector's key, or hold anything but exactly a location, a connector id, `allowSending` as `true` or `false` and `changedAt` as text, `get` shall throw naming the connector and its workspace, with no cause that can quote the file's text. A settings file that is a symbolic link, a hard link or not a plain file can't be read either; a save shall replace the link, not write through it. `remove` shall delete the file without reading it. The adapter shall pass the `contracts.connection-settings-store` suite.

## Examples

- Given settings for the connector `mail` in `/Workspaces/Café`,
  when the folder is read,
  then it holds one file named by the SHA-256 of `["/Workspaces/Café","mail"]`, starting with that location and connector.
- Given sending switched on for `mail` in `/workspaces/acme`,
  when a new store is opened on the same folder, as after a restart,
  then sending is still on for `mail` and off for `docs`.
- Given `mail`'s settings copied over `docs`'s file,
  when `docs`'s settings are read,
  then it throws naming `docs`, and `mail`'s settings still read.
- Given a settings file with `"allowSending": "true"`,
  when it is read,
  then it throws naming `mail` and `/workspaces/acme`.
- Given a settings file that holds only `{`,
  when it is read,
  then it throws naming the connector and its workspace, and `remove` deletes it.
