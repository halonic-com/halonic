# ports.service-sign-in

- Status: active
- Since: unreleased
- Source: stream HAL-17488, the architecture note on HAL-17491 (row 15 and section 6.7), Liam's approval of option (A) with conditions on HAL-17545; ADR `docs/adr/2026-11-24-toolscript.md` (user capabilities)

The ports package shall have a `ServiceSignIn` port through which a stepper step runs a service's own sign-in in the foreground: read the connection file's address and company, start a sign-in, follow it until the key is in the keychain, cancel it, read who the key signs in as, and revoke a test sign-in. Its only service shall be `paperclip`. A connection shall be named by its connection file's name and the host the request names, and the answer to a start shall be the sign-in's ID, its short code, its approval page and when it expires, or a refusal with `no-connection`, `other-host`, `already-signed-in`, `unreachable` or `too-many-sign-ins`. Following shall take an abort signal and end as `signed-in` with the account's name, `expired`, `cancelled` or `wrong-company`. Who the key signs in as shall be an account name only. No call of the port shall take or give a key.

The port's documentation shall state that only Studio holds a `ServiceSignIn`; that aborting a followed sign-in leaves no key behind, even after the keychain write; that a test sign-in refuses a connection that already has a key; and that a sign-in, its account check and its test revoke are not ToolScript capabilities.

## Examples

- Given the `ServiceSignIn` port,
  when its members are read,
  then they are exactly `connection`, `start`, `follow`, `cancel`, `whoAmI` and `revokeTest`.
- Given a connection named for the service `github`,
  when it is compiled,
  then it doesn't compile.
- Given a start answer or an account with a `key` field,
  when it is compiled,
  then it doesn't compile.
