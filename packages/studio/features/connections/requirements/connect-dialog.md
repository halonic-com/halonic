# connections.connect-dialog

- Status: active
- Since: unreleased
- Source: HAL-17497 (phase 1 A4b, split out of HAL-17439 on HAL-17487); ADR `docs/adr/2026-11-24-agent-messaging.md`, section "Sign-in", steps 1 and 2; Julian's security review HAL-17436

When the person presses Connect Paperclip, or Sign in again on a signed-out connection, in Settings › Connections, the Studio window shall open a dialog titled the same that asks for the address the board opens Paperclip at, read-only and filled in with the connection's address when signing in again. When the person presses Continue with an https address, or a plain http address on this computer, the dialog shall start a sign-in there through the engine, open the approval page in the browser, and show the phrase the engine returned, the time left to approve as text, counting down from "10:00 left", and "Open the approval page". When the time left reaches 0:00, the dialog shall show "The sign-in expired" with Start again. When the dialog closes while a sign-in waits, it shall cancel that sign-in without saying so. When the board approves, the dialog shall close. When the board approved but the keychain didn't take the key, the dialog shall say "Halonic couldn't save the key" with Start again. When the engine refuses the address or the person who approved, the dialog shall say why, with the wording of HAL-17498, and offer Start again after an approval was refused.

## Examples

- Given an engine whose sign-in phrase is "amber falcon river seven",
  when the person enters `https://paperclip.acme.test` and presses Continue,
  then the dialog shows "amber falcon river seven" and "10:00 left", and the approval page opens.
- Given a waiting sign-in,
  when 10 minutes pass on the clock,
  then the dialog shows "The sign-in expired" with Start again.
- Given a waiting sign-in,
  when the person closes the dialog,
  then the sign-in is cancelled once.
- Given a signed-out connection "Paperclip · Halonic",
  when the person presses Sign in again,
  then the dialog titled "Sign in again" opens with the connection's address filled in, read-only.
- Given the address `http://paperclip.acme.test`,
  when the person presses Continue,
  then no sign-in starts and the field says "Use an https address. Plain http works only for this computer (localhost)."
- Given a waiting sign-in,
  when the board approves and the keychain refuses the key,
  then the dialog shows "Halonic couldn't save the key" with Start again.
