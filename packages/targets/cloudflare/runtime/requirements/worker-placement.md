# runtime.worker-placement

- Status: active
- Since: unreleased
- Source: HAL-18275 (B1b-2b of the plan on HAL-18020), scope approved on HAL-18274

The Worker shall place every harness step in the sandbox, the run's container, whatever its agent's file says. Its sandbox for `this-computer` shall answer every check with `not-offered` and refuse to open, so no program ever runs on the Worker unfenced.

Rationale: the Worker has no computer of a person's to run a program on outside the fence, and nobody on it can choose to.

## Examples

- Given any harness agent, when the Worker's placement is asked, then it answers `sandbox`.
- Given the Worker's `this-computer` sandbox, when it is checked, then the check is not ok with reason `not-offered`; when it is opened, then it throws and starts nothing.
