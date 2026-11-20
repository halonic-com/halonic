# remote.settings-switch-pending

- Status: active
- Since: unreleased
- Source: HAL-12241; Liam's review of part 1 (a second click must not send a second call while the host call is out)

While the host has not yet answered a change of the switch "Let phones reach this computer" or "Let phones answer risky approvals", the section shall ignore another change of that same switch, so the host gets one call per change. The other switch shall keep working.

## Examples

- Given remote off and a host that hasn't answered yet,
  when the person presses "Let phones reach this computer" twice,
  then the host is asked to turn remote on once.
- Given the same pending call,
  when the person presses "Let phones answer risky approvals",
  then the host is asked to change that switch.
