# cloudflare-live.runs

- Status: active
- Since: unreleased
- Source: HAL-17082, part d of the plan on HAL-13210

The live suite shall sign in to the deployed Worker with its password, start a workflow whose step asks the mock model, and read the run's event stream until it ends. The check shall fail unless the run's log holds the model's answer and its last event is `run.completed`. The fixture shall deploy that workflow, its agent and the mock provider with the webhook routine, and keep only the password's hash in the Worker.

Rationale: the workerd tests drive a run with a model the test builds in. Only a run on the deployed Worker proves its alarm, its snapshot index and its model resolver move a run from start to end.

## Examples

- Given a Worker whose run ends with `run.completed` after an `llm.response`, then the check passes.
- Given a Worker whose run ends with `run.failed`, then the check fails and names `run.failed`.
- Given a run with no `llm.response`, then the check fails and lists the events it got.
- Given an event stream that closes without its `end` message, then the check fails and says the run didn't end.
- Given a wrong password, then the check fails and names the sign-in's 401.
