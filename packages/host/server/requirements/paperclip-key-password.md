# server.paperclip-key-password

- Status: active
- Since: unreleased
- Source: Julian's security decision on HAL-18627 (option B, with three conditions); HAL-18622 `flow` §7.4. Built in HAL-18630, on the routes of `server.paperclip-sign-in`.

When a signed-in session asks `POST /api/paperclip-keys/sign-in/start` (which leads to storing or replacing a Paperclip key) or `POST /api/paperclip-keys/disconnect` (which removes one), the server shall act only when the request's body also carries the current `serve-password` as `password`, checked through the same check as "Add a device" (`server.device-pairing`): counted against `server.login-limit` before it is compared. When the password is missing, the server shall answer 400 `bad_request`; when it is wrong, 401 `wrong_password`, the same answer whether or not a key is stored for that connection, and the sign-in port shall hear nothing. `sign-in/poll` and `sign-in/cancel` shall take no password, since only a sign-in started with it can store a key.

When a poll stores a key, or Disconnect removes one, the server shall record the connection, `connected` or `disconnected`, the device ID of the session that asked (`browser` for a password session) and the time, keeping the newest 20, in the `Coordination` port. `GET /api/devices` and `halonic serve devices` shall show these records. No record, and no route's answer, shall hold the key or any part of it: at most `connected` and the Paperclip address.

Rationale: a paired device's session lasts up to 90 days, so a lost laptop or a leaked token alone must not be able to swap the server's board key for one an attacker controls, and the owner can see which device changed it.

## Examples

- Given a paired device and no `password` in the body, when it asks `sign-in/start`, then it answers 400 and the port hears nothing.
- Given a wrong password, when `sign-in/start` or `disconnect` is asked, then it answers 401 `wrong_password` with the same body with and without a stored key, and the 11th wrong try in the window answers 429, as an 11th wrong "Add a device" does.
- Given the right password, when a sign-in is approved and polled, then `GET /api/devices` and `halonic serve devices` show "Paperclip key for halonic connected" with that device's ID and the time, and no key.
