# studio.src-tauri.crates.agent-host.default-distro

- Status: draft
- Since: unreleased
- Source: HAL-12445 (W6 of the HAL-5407 review, finding F3 of HAL-12434)

When the shell asks whether Halonic's distro is WSL's default distro, it shall run `wsl.exe --list --verbose` by its full path, without `WSLENV`, and stop it when it hasn't ended within the time given. It shall decode what `wsl.exe` printed as UTF-16 little-endian (or as UTF-8 when it has no zero byte), read only the line whose first character other than a space is `*`, and answer whether the name after the `*` is exactly `halonic`, ignoring the rest of the line. It shall answer "unknown" when no line has a `*`, and an error when `wsl.exe` can't start, ends with an error or runs out of time.

## Examples

- Given an English, German or French Windows whose list marks `halonic` with `*`,
  when the shell asks,
  then the answer is yes, whatever the header and the state column say.
- Given a list whose `*` line names `Ubuntu`, or `halonic-old`,
  then the answer is no.
- Given a list with no `*` line,
  then the answer is unknown.
- Given a `wsl.exe` that hangs,
  when the time given runs out,
  then it is stopped and the answer is an error.
