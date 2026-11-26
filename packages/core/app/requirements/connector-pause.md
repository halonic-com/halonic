# app.connector-pause

- Status: active
- Since: unreleased
- Source: HAL-19188 plan rev 2, PR 2 (HAL-19197), from HAL-511 requirement 9; Liam's answers on HAL-19188 (a separate `paused` record keyed by workspace, connector id and code hash, read where the trust is checked, failing closed; only a new code lifts it)

When a connector is paused for the code of its integration, the app shall keep the pause in a record store of its own in the user's profile, apart from the trust record, keyed by the workspace's location, the connector's id and the hash of that code. A pause shall count from the moment it is made, before it is saved, for every start in the same process. At every start of a local integration's runner, after the trust check of `app.trusted-runner-start` passes, the app shall look for a pause of the connector for the code as it is now; when there is one, it shall throw `ConnectorPausedError` with the reason `connector-paused` and start no process. When the pauses can't be read, or a record in them isn't exactly a pause under its own key, it shall throw `ConnectorPausedError` with the reason `pause-unreadable`, naming the damaged file or the store's folder, and start no process. Trusting the same code again shall not lift a pause; only a changed code that the person trusts again starts the connector. Removing a connector's pause shall lift it for every code of that connector in that workspace and for no other connector.

## Examples

- Given the connector `radar` paused for an undeclared host,
  then its next start throws `connector-paused` and nothing starts, in this run and in a new one.
- Given the same after `secret-in-request`,
  then the same.
- Given a pause made and two starts fired at once before it is saved,
  then both throw `connector-paused`.
- Given a paused connector whose code changed and was trusted again,
  then it starts.
- Given a paused connector whose same code was trusted again,
  then it stays paused.
- Given `radar-home` paused, then `radar-work`, the same integration folder, starts.
- Given a damaged log of pauses,
  then no connector starts, and the reason names the file.
- Given `radar-home`'s pause removed,
  then it starts again, and `radar-work`'s pause stays.
