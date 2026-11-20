# agent-host.sandbox-setting-copy

- Status: active
- Since: unreleased
- Source: HAL-13319 (continues HAL-10796); Liam's decision of 16 Nov on HAL-10796 (the shell writes the setting into the distro too)

When Studio's shell runs the agent host with `--sandbox-setting-copy`, the host shall read the sandbox setting from its standard input, never from its arguments, and save it in its profile folder only when it is exactly a valid sandbox setting of at most 4096 bytes, writing a temporary file and renaming it over the setting. When it runs with `--sandbox-setting-remove`, the host shall remove the setting from its profile folder, and no setting there shall not be an error. Both shall print `{"ok":true}` and exit with 0 when done; otherwise they shall print `{"ok":false,"reason"}`, exit with 1 and leave the setting saved before as it was. Without `--profile-folder` they shall change nothing and exit with 1.

## Examples

- Given the setting `{"backend":"srt-wsl","chosenAt":"…"}` on standard input,
  when the host runs with `--sandbox-setting-copy`,
  then the profile's `sandbox/sandbox-setting.json` holds that setting, in a folder only its owner can read.
- Given a copy saved before and `{"backend":"docker","chosenAt":"…"}` on standard input,
  when the host runs with `--sandbox-setting-copy`,
  then it exits with 1 and the copy saved before stays.
- Given more than 4096 bytes on standard input,
  then the host refuses them without reading on.
- Given a saved copy,
  when the host runs with `--sandbox-setting-remove`,
  then the copy is gone, and a second removal also exits with 0.
