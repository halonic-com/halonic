# studio.src-tauri.keep-awake-command

- Status: draft
- Since: unreleased
- Source: HAL-17641 (phase 2 G5); section 2.4 of the HAL-17511 architecture note; the board's ★P4 on HAL-17544

When the page calls `keep_awake_set` with the setting "Keep this computer awake while it's plugged in" and remote's state, the shell shall hold or release the system's sleep lock as `studio.src-tauri.crates.keep-awake.keep-awake` says, and answer whether it is held now. It shall take nothing else from the page. While both are on, the shell shall read the power source again at least once a minute, so unplugging releases the lock. Until the page first calls it, the shell shall hold nothing. If the lock can't be held, the command shall be refused as `failed`, with the system's reason in the shell's log. The command shall be granted to the app's own local main window on desktop only, never to a focused app's window or the Studio the computer serves.

## Examples

- Given the shell has just started,
  when nothing has called `keep_awake_set`,
  then no sleep lock is held.
- Given the setting on and remote off,
  when the page calls `keep_awake_set`,
  then the answer is false and no lock is held.
- Given both on and the computer plugged in,
  when it is unplugged,
  then the lock is released within a minute.
