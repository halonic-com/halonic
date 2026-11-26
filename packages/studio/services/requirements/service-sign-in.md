# services.service-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17545 (approvals stream HAL-17488, PR 13), Liam's approval of option (A) with conditions 1 to 4; requirement `ports.service-sign-in`; architecture note on HAL-17491, row 15 and section 6.7

The Studio services shall have a `ServiceSignIn` for Paperclip that runs the sign-in Settings › Connections uses, through the agent host, and sends no Paperclip request of its own. It shall pass the `contracts.service-sign-in` suite. It shall refuse to start when the request's host isn't the connection file's `https` address (`other-host`), and when a test sign-in is asked for a connection that already has a key in the keychain (`already-signed-in`). It shall refuse a started sign-in whose approval page isn't `https`, on exactly the connection file's origin, at `/cli-auth/<id>`, and cancel it. The expiry it answers shall be at most 10 minutes after the start on its own clock, whatever the host answers. When the stepper closes during the wait, it shall cancel the sign-in, and when the close comes after the keychain write, it shall revoke the key and delete the keychain entry, so nothing is kept. Revoking a test sign-in shall revoke its key at Paperclip with `revoke-current` and delete the keychain entry.

## Examples

- Given the `acme` connection file at `https://paperclip.acme.example`,
  when a started sign-in's approval page is on `https://paperclip.evil.example`,
  then the start answers `other-host` and the sign-in is cancelled.
- Given a finished test sign-in for `acme`,
  when it is revoked,
  then Paperclip received `POST /api/cli-auth/revoke-current`, `/api/cli-auth/me` answers 401 for its key, and the keychain is empty.
- Given a sign-in the board approved,
  when the stepper closes right after the key was written to the keychain,
  then the follow answers `cancelled` and the keychain is empty.
