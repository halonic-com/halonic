# cloudflare-durable.run-container-object

- Status: active
- Since: unreleased
- Source: HAL-18020, part 3b of the plan on HAL-13211

The run container object shall own one run's container, named as the run's run object is. When it starts the container, it shall point every intercept at a handler that is told the outbound rules and the run object's name by the object alone. When the run ends, or its alarm stops the container at the run's time limit, it shall destroy the container and then revoke the run's bridge credential. Where the deployment gives the class no container, it shall refuse to start and report itself unavailable.

Rationale: the program in the container must reach only its own run's bridge, and its credential must not outlive the container, even when the run object never ends the run.

## Examples

- Given the container object `u/acme/run_1`, when it starts with the bridge and `registry.npmjs.org` allowed, then both intercepts go to a handler told those rules and the run object `u/acme/run_1`.
- Given a started container, when its alarm fires, then the container is destroyed and the bridge credential of `u/acme/run_1` is revoked.
- Given a deployment with no container for the class, when a run asks to start one, then it is refused.
