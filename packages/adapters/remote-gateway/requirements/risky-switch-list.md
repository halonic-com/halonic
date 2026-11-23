# remote-gateway.risky-switch-list

- Status: active
- Since: unreleased
- Source: plan on HAL-15194 ("PR 3 revised"), approved on HAL-16968; details decided on HAL-16973; task HAL-16969

Every `sessions` the gateway sends shall carry `answersRisky`, read from the person's "Let phones answer risky approvals" switch when the list is made. When the host says the switch changed, on or off, the gateway shall send every connection past `welcome` the full list again, without `replyTo`, behind the frames that connection is already handling, and nothing to a connection that hasn't said `hello`. `answersRisky` is only a hint for what the phone shows: the gateway shall still read the switch again for every answer, so an answer to a `risky` approval while the switch is off gets `not-allowed-remotely` whatever list the phone last saw. A phone of an older message version shall get `unsupported-version` and no list.

## Examples

- Given the switch off, then on, then off again,
  when the host says it changed each time,
  then the phone gets three lists without `replyTo`, and the last says `answersRisky: false`.
- Given a phone that last saw `answersRisky: true` and a switch turned off without a new list,
  when it answers a risky approval,
  then it gets `not-allowed-remotely` and the session hears nothing.
- Given a phone that says `hello` with version 2,
  when it connects to a version 3 host,
  then it gets `unsupported-version` without `replyTo`, the connection closes, and no list is sent.
