# remote.keep-awake

- Status: active
- Since: unreleased
- Source: HAL-18804 (phase 2 G5b); the board's P4 on HAL-17544; wording row p08c of HAL-17514, checked on HAL-17547

Where the desktop shell gives its `keep_awake_set` command, Settings › Remote shall show the switch "Keep this computer awake while it's plugged in" with the line "So your phone can reach it.", off until the person turns it on. When the person changes it, Studio shall call `keep_awake_set` with the new setting and remote's state, then save the setting. While the window is open, with Settings open or not, Studio shall call `keep_awake_set` again whenever remote turns on or off, or the setting changes elsewhere. When the shell refuses or the save fails, the switch shall stay as it was, and the section shall say "Couldn't save the keep-awake setting. Try again." under the box and announce it. Where the shell has no `keep_awake_set` (served Studio, the phone), the row shall not show.

## Examples

- Given a fresh install with nothing saved,
  when Settings › Remote opens on the desktop,
  then "Keep this computer awake while it's plugged in" is off.
- Given remote on and the switch off,
  when the person turns the switch on,
  then the shell is told `{ keep: true, remote: true }` and the setting is saved on.
- Given the setting on and remote on,
  when remote turns off,
  then the shell is told `{ keep: true, remote: false }`.
- Given a shell that refuses,
  when the person turns the switch on,
  then it stays off, and "Couldn't save the keep-awake setting. Try again." shows and is announced.
