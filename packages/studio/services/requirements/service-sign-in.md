# services.service-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17545 (approvals stream HAL-17488, PR 13), Liam's approval of option (A) with conditions 1 to 4; requirement `ports.service-sign-in`; architecture note on HAL-17491, row 15 and section 6.7; HAL-20278 (the page reads no keychain entry); HAL-20265 (the shell's `agent_host_paperclip_key_kept`, plan approved on HAL-20452)

The Studio services shall have a `ServiceSignIn` for Paperclip that runs the sign-in Settings › Connections uses, through the agent host, and sends no Paperclip request of its own. It shall pass the `contracts.service-sign-in` suite. It shall refuse to start when the request's host isn't the connection file's `https` address (`other-host`), and when the sign-in would write over a key (`already-signed-in`): a test sign-in for a connection the shell keeps a keychain entry for, as `agent_host_paperclip_key_kept` answers, or the agent host lists in any state but `no-key`, and any other sign-in for such a connection unless the host lists it as `signed-out`. The keychain entry is per connection name, so one signed in from another workspace counts. When the shell can't say whether it keeps an entry, the start shall be refused as `unreachable` and the failure reported. It shall refuse a started sign-in whose approval page isn't `https`, on exactly the connection file's origin, at `/cli-auth/<id>`, and cancel it. The expiry it answers shall be at most 10 minutes after the start on its own clock, whatever the host answers. When the stepper closes during the wait, it shall cancel the sign-in, and when the close comes after the keychain write, it shall revoke the key and delete the keychain entry, so nothing is kept. Revoking a test sign-in shall revoke its key at Paperclip with `revoke-current` and delete the keychain entry; if the shell's keychain refuses that delete, then the revoke shall answer `still-works` and report the failure. A late approval that both the close and the cancel reach shall disconnect once. The start shall answer the approval page as it parsed it.

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
- Given a keychain entry for `acme` signed in from another workspace, which the agent host doesn't hold, so it lists `acme` as `no-key`,
  when a sign-in starts for `acme`, as a test or not,
  then the start answers `already-signed-in`, and nothing is written or deleted.
- Given a test sign-in the board approved,
  when the keychain refuses to delete its entry on revoke,
  then the revoke answers `still-works`.
