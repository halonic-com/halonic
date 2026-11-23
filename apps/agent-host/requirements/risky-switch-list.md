# agent-host.risky-switch-list

- Status: active
- Since: unreleased
- Source: plan on HAL-15194 ("PR 3 revised"), approved on HAL-16968; details decided on HAL-16973; task HAL-16969

When the person turns "Let phones answer risky approvals" on or off, the agent host shall have the remote gateway send every connected phone the session list again (`remote-gateway.risky-switch-list`), at once, also when writing the switch fails, since the change holds all the same (`agent-host.remote-settings`). The list's `answersRisky` is only a hint for what the phone shows; the gateway's check of the switch for every answer (`agent-host.remote-gateway`) stays the gate and doesn't change.

## Examples

- Given the risky switch off,
  when the person turns it on and then off,
  then the gateway lists again twice.
- Given a profile whose settings file can't be written,
  when the person turns the risky switch on,
  then the step fails and the gateway still lists again.
