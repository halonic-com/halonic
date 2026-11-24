# connections.connect-dialog

- Status: active
- Since: unreleased
- Source: HAL-17497 (phase 1 A4b, split out of HAL-17439 on HAL-17487); ADR `docs/adr/2026-11-24-agent-messaging.md`, section "Sign-in", steps 1 and 2; Julian's security review HAL-17436

When the person presses Connect Paperclip, or Sign in again on a signed-out connection, in Settings › Connections, the Studio window shall open a dialog titled the same that asks for the address the board opens Paperclip at, filled in with the connection's address when signing in again. When the person presses Connect with a web address, the dialog shall start a sign-in there through the engine, open the approval page in the browser, and show the phrase the engine returned, "Open the approval page" and the time left to approve as text, counting down from 10:00. When the time left reaches 0:00, the dialog shall show the sign-in as ended, with the phrase faded and Start again. When the dialog closes while a sign-in waits, it shall cancel that sign-in. When the engine refuses the address or the person who approved, the dialog shall say why and offer Start again.

## Examples

- Given an engine whose sign-in phrase is "amber falcon river seven",
  when the person enters `https://paperclip.acme.test` and presses Connect,
  then the dialog shows "amber falcon river seven" and "Time left to approve: 10:00", and the approval page opens.
- Given a waiting sign-in,
  when 10 minutes pass on the clock,
  then the dialog shows "Time left to approve: 0:00" and "The sign-in ended" with Start again.
- Given a waiting sign-in,
  when the person closes the dialog,
  then the sign-in is cancelled once.
- Given a signed-out connection "Paperclip · Halonic",
  when the person presses Sign in again,
  then the dialog titled "Sign in again" opens with the connection's address filled in.
