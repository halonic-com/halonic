# cli.local-integration-pause

- Status: active
- Since: unreleased
- Source: HAL-19188 plan rev 2, PR 2 (HAL-19197), from HAL-511 requirement 9; builds on `cli.open-local-integration` and `app.connector-pause`

When the runner of a local integration opened by the `halonic` command reports that the integration's code sent a request to a host its permission sheet doesn't list (`host-not-declared`), or that the kit refused a request for a code on its leak list (`leak-attempt`), the command shall pause the connector in the profile's `connector-pauses` folder for the code it runs, and stop the runner, before the refusal goes back to the integration's code. Every call in flight on that runner shall fail with `ConnectorPausedError`, and every later start of that connector, in the same run or a new one, shall be refused as `app.connector-pause` says, with no runner started, until its code changes and the workspace is trusted again or the pause is removed. Another connector of the same integration folder shall run on. A fence or protocol block shall stop the runner as before and pause nothing.

## Examples

- Given a call whose request goes to `undeclared.example.net`,
  then the call fails as paused, the code never sees the refusal, and the next call, and a call in a new run, start no runner.
- Given the same with `secret-in-request`,
  then the same.
- Given two calls fired together, one of them blocked,
  then both fail as paused, and so do the next two.
- Given the paused connector's code changed and trusted again,
  then the next call starts a runner and answers.
- Given the same code trusted again,
  then it stays paused.
- Given `notes` paused, then `notes-copy` of the same folder answers.
- Given the pause removed,
  then the next run starts it.
- Given the profile's log of pauses damaged,
  then no runner starts and the refusal names the file.
- Given a protocol block,
  then nothing is paused.
