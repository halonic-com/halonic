# remote.shell-declined

- Status: active
- Since: unreleased
- Source: HAL-17880; follows `studio.src-tauri.remote-saves-ask`

When the host refuses turning remote on, letting phones answer risky approvals, or Allow for a phone as `declined`, because the person said no in the desktop shell's own dialog, Settings › Remote and the Pair a phone dialog shall show no error and announce nothing, and the setting shall stay as it was: the switch stays off, and Check the code still waits for Allow or Don't allow.

## Examples

- Given remote is off,
  when the person turns on "Let phones reach this computer" and says no in the shell's dialog,
  then the switch stays off and no "Couldn't turn remote on. Try again." shows.
- Given a phone used the pairing code,
  when the person presses Allow and says no in the shell's dialog,
  then the phone isn't paired, Check the code still shows, and no "Couldn't pair" line shows.
