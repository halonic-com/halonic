# studio.src-tauri.crates.elevate-start.raised-start

- Status: draft
- Since: unreleased
- Source: HAL-16541 (Liam's call), HAL-16523

When Studio starts on Windows, the shell shall read its process token's elevation type before it starts anything. If the type is "full" (Windows raised Studio to administrator rights from an account whose other programs run without them), or the type can't be read and the account is an administrator, then the shell shall show one native message telling the person to open Halonic again without administrator rights, and quit without opening a window or starting the agent host. With the type "default" (UAC off, or the built-in Administrator) or "limited", it shall start as before.

## Examples

- Given Studio was opened with "Run as administrator" on an account with UAC on,
  when it starts,
  then the token's type is "full", the message shows, and Studio quits.
- Given UAC is off and the account is an administrator,
  when Studio starts,
  then the token's type is "default" and Studio starts as before.
- Given the token's type can't be read,
  when Studio starts on an administrator account,
  then it counts as raised; on any other account it starts as before.
