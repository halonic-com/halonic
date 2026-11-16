# fs-node.sandbox-setting-store-files

- Status: active
- Since: 0.1.0
- Source: `SandboxSettingStore` port v1; HAL-5392; the file rules of `fs-node.agent-placement-store-files`

The fs-node sandbox setting store shall keep the person's sandbox choice as one JSON file, `sandbox-setting.json`, in a folder given to it, with the backend first. A save shall write a flushed temporary file and rename it over the choice, make the folder and file private to the user on systems with modes, and leave no temporary file behind when it fails. A folder that isn't there yet shall read as no choice.

A file that isn't exactly a valid choice (not JSON, not an object, a backend that isn't listed, a missing or non-text field, an extra field, `none` without an app version), a file that is a link or hard link, and a file that is a folder shall make `get` throw naming the file; `remove` shall delete it without reading it and without touching what a link points to, and `save` shall replace a link without writing through it.

## Examples

- Given a saved choice of none with an app version,
  when the folder is read,
  then it holds one file, whose first field is `backend`.
- Given a file with `{"backend":"srt","chosenAt":"x","command":"sh"}`,
  when the choice is read,
  then `get` throws, and after `remove` it reads as `null`.
- Given a choice that is a symbolic link to a valid choice in a workspace,
  when it is read,
  then `get` throws.
