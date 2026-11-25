# runtime.worker-bridge

- Status: active
- Since: unreleased
- Source: HAL-18118 (from HAL-18020), part 3b of the plan on HAL-13211

When a harness step opens its bridge on the Worker, the Worker shall give the run one random credential that lasts until the run container's time cap at most, keep only its SHA-256 in the run object's storage, and answer a request for that run only when it carries that credential, with 401 otherwise. When the engine closes the bridge, or the run container's alarm stops the run, the Worker shall revoke the credential and stop the run's requests still in flight. A run shall never get a second credential.

Rationale: the program in the container is not trusted; the credential is the only thing that lets it reach the model gateway, so it must not outlive the run or its container, and a copy of the storage must not be able to call the bridge.

## Examples

- Given `run_1`'s open bridge, when a request for `run_1` carries its credential, then the bridge answers it; with another value, or for `run_2`, it gets 401.
- Given `run_2`'s model call in flight, when the container's alarm stops `run_2`, then the call is aborted and the credential gets 401 from then on.
- Given a closed bridge of `run_1`, when the engine opens it again, then it is refused.
