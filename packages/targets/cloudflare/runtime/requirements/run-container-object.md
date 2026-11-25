# runtime.run-container-object

- Status: active
- Since: unreleased
- Source: HAL-18020, part 3b of the plan on HAL-13211

The Worker shall export the run container object under the class name `RunContainerObject`, bound as `RUN_CONTAINER`, and a `ContainerOutbound` entrypoint that handles every request its intercepts catch. The entrypoint shall check each request against the rules the container object gave it, send a request for the bridge to the run object the container object named, send a request for an allowed site out, and answer 403 to anything else. A run object shall answer a bridge request only for the run it is named after, and shall revoke that run's bridge credential when the container object asks.

Rationale: the program in the container is not trusted, so which run's bridge it reaches must come from the container object, never from the request.

## Examples

- Given the rules of `u/acme/run_1`, when its container calls `http://bridge.halonic.invalid/v1/messages`, then the run object `u/acme/run_1` answers it.
- Given the same rules, when the container calls `https://example.com/`, or the bridge over HTTPS, then the answer is 403 and nothing is called.
