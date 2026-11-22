# runtime.worker-runs

- Status: active
- Since: unreleased
- Source: HAL-16198, part b of the plan on HAL-13210

The Worker's API shall start, send events to and cancel runs with its own executor (`runtime.worker-executor`). A new run shall start from the run-definitions index of the snapshot this Worker version serves: the workflow, and the hub's agents, workflows, collections, knowledge sources, skills and connector `tools` lists. When the index has no such hub or the hub no such workflow, the start shall fail as not found, so the API answers 404 and nothing is stored. When the snapshot has no run-definitions index, the start shall fail with an error that says to deploy again. A run's live events shall stream from its run object. Starting an agent run shall answer 501, as on `halonic serve`, and a chat turn shall be refused. Until the Worker reads the deployed workspace's models, a model call shall fail the run's step with an error that says the Worker can't call a model yet.

Rationale: a run the Worker starts must start from the definitions its deployer uploaded with this Worker version, never from YAML parsed in the Worker, and a name the deployment doesn't have is the caller's mistake, not a server error.

## Examples

- Given a snapshot whose index has the `acme` hub's `reply` workflow, when the Worker starts `acme`/`reply`, then the run is stored as `running` with `run.started`, and its run object gets the timer of its first step.
- Given the same snapshot, when the Worker starts `acme`/`nothing` or `globex`/`reply`, then the start fails as not found and no run is stored.
- Given a snapshot without a run-definitions index, when the Worker starts a run, then the start fails and the error says to run `halonic deploy` again.
- Given a running run, when it is cancelled, then it ends with `run.failed` and reason `cancelled`.
- Given a run whose first step calls a model, when its timer is delivered, then the run fails and its error says the Worker can't call a model yet.
