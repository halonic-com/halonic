# ports.action-sender

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC), the architecture note on HAL-17491 (revision 12) with Liam's and Julian's reviews, Liam's port-shape OK on HAL-17533; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516; HAL-20267 (Liam's OK on the more-than-one signal)

The ports package shall have an `ActionSender` port through which Studio runs one step of a stepper the user runs, with the user's own sign-in to the step's service, and through which the user signs in to a service, signs out of it, and reads which account is signed in. A send shall name a reviewed call step by its definition, version and step number, with one value per placeholder and the step's body fields as plain values or lists of numbers, and shall take no address, method or header. Opening a guided step's page shall name the step the same way. A send's result shall be an answer with the status, only the route's kept fields as plain values and, for a failed status, the service's error message, and for a successful `GET` whose answer listed more than one match, no kept fields, no error text and `unusable: "more-than-one"`; a refusal with `not-in-catalog`, `bad-value`, `signed-out` or `too-often`; `cancelled` when the user closed the sender's native dialog; or `unreachable`. No call of the port shall take or give a token or a secret value.

The port's documentation shall state that only the user runs steps; that agents, the engine, the agent host and the harness bridge never get an `ActionSender`; that the sender takes the method, the path, the body's fields and the kept fields from a route list generated from the catalog; that it fills `constant` and `secret-input` body fields itself; and that it confirms `admin` and `irreversible` steps and asks for secret values in its own native dialog.

## Examples

- Given the `ActionSender` port,
  when its members are read,
  then they are exactly `account`, `signIn`, `signOut`, `send` and `openGuided`.
- Given a send request with a `path` or `headers` field, or a body field that is an object,
  when it is compiled,
  then it doesn't compile.
- Given an answer whose kept field is an object, or an account with a `token`,
  when it is compiled,
  then it doesn't compile.
- Given an answer with `unusable` set to anything but `more-than-one`,
  when it is compiled,
  then it doesn't compile.
