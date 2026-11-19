# ports.connector-start-failure

- Status: active
- Since: unreleased
- Source: HAL-12471 (PR 2 of the plan Liam approved on HAL-12575); the typed start errors of HAL-12410

The ports package shall give a `connectorStartFailureOf(value)` reader that tells why a connector couldn't start, from the error it threw: `program-missing` with the program's name for an `Error` named `ProgramNotFoundError` with a non-empty string `program`, and `secret-not-set` with the secret's name for an `Error` named `SecretNotSetError` with a non-empty string `secretName`. It shall read them by name and field, without `instanceof`, so the engine needs no adapter. It shall return `undefined` for any other value and shall never keep any part of the error's message.

## Examples

- Given an `Error` named `ProgramNotFoundError` with `program: "npx"`,
  when it is read,
  then the result is `{ reason: "program-missing", program: "npx" }`.
- Given an `Error` named `SecretNotSetError` with `secretName: "NOTES_TOKEN"` and a message that names a folder,
  when it is read,
  then the result is `{ reason: "secret-not-set", secret: "NOTES_TOKEN" }`, without the folder.
- Given a plain `Error`, one of those names without its field or with an empty one, or an object that only looks like one,
  when it is read,
  then the result is `undefined`.
