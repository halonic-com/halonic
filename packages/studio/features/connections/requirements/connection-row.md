# connections.connection-row

- Status: active
- Since: unreleased
- Source: HAL-17497 (phase 1 A4b, split out of HAL-17439 on HAL-17487); ADR `docs/adr/2026-11-24-agent-messaging.md`, sections "The key" and "Sign-in"; requirement `ports.paperclip-key`; HAL-19032 (a key this computer doesn't hold yet isn't "expired or revoked"; plan approved by Liam on HAL-19033, wording by Sofia on HAL-19034); HAL-19120 (Sofia's check on HAL-19111: Disconnect promised a revoke on a row with no key, and two Sign in buttons couldn't be told apart; decided by the team, HAL-2282)

While the engine serves connections, Settings › Connections shall list each one as a read-only row: its label ("Paperclip · Halonic"), "Read-only", its host, its state ("Connected", "Offline", "Signed out" or "Not connected") with "Checked 14:02", "Offline, as of 14:02", "key expired or revoked" or "no key on this computer", the line "This key can do everything the board can in Paperclip", Sign in again while it is signed out, Sign in while it is not connected, and Disconnect. While this computer holds no key for a connection, its row shall show "Not connected" in a neutral tone, the line "Sign in to read and answer from this computer. Until then, Inbox and Messenger show what was read last." and Sign in, which opens the dialog titled "Sign in" with "Halonic has no key for Paperclip · Halonic on this computer. Sign in to read and answer from here.", and shall never say "key expired or revoked". Each row's Sign in again, Sign in and Disconnect shall be described by the row's name, so a screen reader can tell the rows' buttons apart. When the person presses Disconnect, the section shall ask before it disconnects, then ask the engine once, and say that the key was revoked or, when the revoke failed, that the key stays valid until its expiry and can be revoked in Paperclip, with Open Paperclip. While this computer holds no key for the connection, the confirmation shall instead say "Halonic deletes the cache from this computer. This computer holds no key for it, so nothing is revoked: revoke the key in Paperclip if you no longer need it. Your cards, tasks and chats stay in Paperclip.", and when the engine revoked nothing the section shall say "Disconnected Paperclip · Halonic." and never that its key is revoked or still valid.

## Examples

- Given a connected "Paperclip · Halonic",
  when Settings › Connections opens,
  then its row shows "Connected" and "This key can do everything the board can in Paperclip", and no Sign in again.
- Given a signed-out connection,
  when Settings › Connections opens,
  then its row shows "Signed out" and Sign in again.
- Given a connection this computer holds no key for, such as after a restart before its key is restored,
  when Settings › Connections opens,
  then its row shows "Not connected", "no key on this computer" and Sign in, and not "key expired or revoked".
- Given an engine whose revoke fails and a key valid until 24 Dec 2026,
  when the person presses Disconnect, then Disconnect in the confirmation twice quickly,
  then the engine is asked once and the section says "Disconnected Paperclip · Halonic, but its key is still valid." and that it stays valid until 24 Dec 2026.
- Given two connections this computer holds no key for, "Paperclip · Halonic" and "Paperclip · Acme",
  when a screen reader reaches each row's Sign in,
  then it hears that row's name with it.
- Given a connection "Paperclip · Halonic" this computer holds no key for,
  when the person presses Disconnect, then Disconnect in the confirmation,
  then the confirmation says nothing is revoked, and the section says "Disconnected Paperclip · Halonic."
- Given no connection,
  when Settings › Connections opens,
  then it says "No connections" and offers Connect Paperclip.
