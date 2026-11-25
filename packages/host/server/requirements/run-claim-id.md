# server.run-claim-id

- Status: active
- Since: unreleased
- Source: HAL-13217; Liam's review of the run-access pull request

Where the server is built for many users (`users.mode: many`), when a start names a run id that is not a non-empty string of at most 256 UTF-8 bytes, the server shall answer 400 `bad_request`, record no owner for that id and start nothing.

Rationale: recording a run's owner writes a row the host keeps, so an id the start would refuse anyway must not reach that store.

## Examples

- Given a start with the run id `""`, a 257-byte id, or the number `42`, then it answers 400, no owner is recorded and nothing starts.
