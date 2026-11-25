# studio.src-tauri.crates.login-item.login-item

- Status: draft
- Since: unreleased
- Source: HAL-14221; decision D9 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212, section 5)

When the shell turns Halonic's login item on, it shall write one entry for the current user only (on Windows the value `Halonic` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, on macOS the LaunchAgent `com.halonic.studio`, on Linux the XDG autostart file `halonic.desktop`) that starts the running executable with exactly the argument `--background`, with the path quoted for that system (in double quotes on Windows, escaped by the Desktop Entry rules on Linux, as its own XML-escaped string on macOS). If Halonic doesn't run from where it was installed (on Windows the folder in its uninstall entry's `InstallLocation`, on macOS an app bundle in `/Applications` or `~/Applications`, on Linux under `/usr` or `/opt`), then the shell shall write nothing. If the executable's path isn't absolute or holds a control character or a double quote, then the shell shall write nothing. When the shell turns the login item off, it shall remove that entry, and an entry that isn't there shall count as off.

## Examples

- Given Halonic installed in the folder `<install folder>`, whose name holds a space,
  when the login item is turned on,
  then the `Run` value reads `"<install folder>\Halonic.exe" --background`.
- Given Halonic run from a folder of downloads,
  when the login item is turned on,
  then nothing is written and the answer is that Halonic isn't installed.
- Given a Linux path holding `$` and `%`,
  when the login item is turned on,
  then `Exec=` holds them escaped, so no shell or field code reads them.
- Given no entry,
  when the login item is turned off,
  then it answers off without an error.
