# google-setup.setup-record

- Status: active
- Since: 0.1.0
- Source: HAL-706 (build plan B1, D5; design 3.6); HAL-709 added the refused refresh; HAL-1176 the six check kinds (D5 rev. 5)

The setup records shall keep one record per Google account in the record store collection `_google_setups`, under a random account ref from the `IdGenerator`. A new record shall hold the route, the account type and the time it was started, with every other value unset. Each edit shall change only its own values, stamped with the clock's time: the account type, the project ID, a step done or reopened, the "In production" tick, the client ID, the client secret's ref, a sign-in started, dropped or finished (a finished one also clears a refused refresh), and one service's check result: one of the six `ServiceCheckOutcome` kinds with its fields, and when it ran. The records shall read back the same after the store is opened again.

## Examples

- Given a new personal setup,
  then it is saved under `gaccount_1` in `_google_setups` with its start time, no steps done and no client.
- Given steps `project` and `apis` marked done at different times,
  then the record holds each step with its own time, and reopening `apis` leaves only `project`.
- Given a sign-in that was started,
  when it comes back, then the record keeps the time as the last sign-in and no sign-in is waiting;
  when it is dropped instead, then no sign-in is waiting and the last sign-in is unchanged.
- Given one check result of each kind, `works`, `allowed`, `scopeNotGranted`, `apiOff`, `checkFailed` and `unreachable`,
  then each reads back with the same fields after the store is opened again.
- Given two setups, then listing gives both, and reading an unknown account ref gives `null`.
- Given an edit to an account ref with no record, then it throws `SetupRecordError` `not-found`.
