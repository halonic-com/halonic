# integration.phone-gateway-interop

- Status: draft
- Since: unreleased
- Source: HAL-15179 (tunnel D7, design on HAL-15159, section 2)

The suite shall run the phone's gateway client against the real remote gateway on loopback, through the gateway's test phone, which speaks the real end-to-end session. It shall check that the client lists and watches a session, shows its events and open approvals as they arrive, answers a normal approval and sends a prompt once each and gets the host's `ok`, never sends an answer to a `risky` approval, and goes stale, keeping what it showed, when the gateway closes.

## Examples

- Given a running session with a message and two approvals, one of them risky,
  when the phone connects,
  then it shows the three events, and only the normal approval can be answered.
- Given that view,
  when the person approves the normal approval,
  then the host records one answer and the phone gets `done`.
- Given a live view,
  when the gateway closes,
  then the view keeps its events and says "Reconnect to answer."
