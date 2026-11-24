# services.agent-connections

- Status: active
- Since: unreleased
- Source: HAL-17497 (phase 1 A4b, split out of HAL-17439 on HAL-17487); ADR `docs/adr/2026-11-24-agent-messaging.md`, sections "Sign-in" and "The key"

The Studio shall reach the engine's connections and their sign-in only through one `AgentConnections` service key, which carries no key and no provider type, and shall ship a fake of it with no engine behind it. The fake shall count every sign-in, cancel and disconnect, end a waiting sign-in only when the test approves, refuses, expires or cancels it, give each sign-in the phrase it was made with and an expiry 10 minutes after it started, and remove a disconnected connection.

## Examples

- Given a fake whose phrase is "amber falcon river seven",
  when a sign-in starts,
  then its challenge shows that phrase and ends 10 minutes later.
- Given a waiting sign-in,
  when it is cancelled twice,
  then the fake counts one cancel and the sign-in ends as cancelled.
- Given a waiting sign-in,
  when the test approves it,
  then the sign-in ends connected and the list holds the new connection.
- Given a fake whose revoke fails,
  when a connection is disconnected,
  then the answer says the key stays valid until its expiry and the list no longer holds it.
