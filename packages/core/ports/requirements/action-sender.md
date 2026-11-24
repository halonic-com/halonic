# ports.action-sender

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC), the architecture note on HAL-17491 with Liam's and Julian's reviews; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516

The ports package shall have an `ActionSender` port through which Studio sends one step of a stepper the user runs, with the user's own sign-in to the step's service, and through which the user signs in to a service, signs out of it, and reads which account is signed in. A send shall name a reviewed catalog step by its definition, version and step number, with one value per placeholder and an optional body, and shall take no address, method or header. Its result shall be an answer with the status, only the step's kept fields as plain values and, for a failed status, the service's error message; a refusal with `not-in-catalog`, `bad-value` or `signed-out`; or `unreachable`. No call of the port shall take or give a token.

The port's documentation shall state that only the user runs steps, that agents, the engine and the agent host never get an `ActionSender`, and that the sender takes the method, the path and the kept fields from its allow-list of catalog steps.

## Examples

- Given the `ActionSender` port,
  when its members are read,
  then they are exactly `account`, `signIn`, `signOut` and `send`.
- Given a send request with a `path` or `headers` field,
  when it is compiled,
  then it doesn't compile.
- Given an answer whose kept field is an object, or an account with a `token`,
  when it is compiled,
  then it doesn't compile.
