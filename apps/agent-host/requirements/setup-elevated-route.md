# agent-host.setup-elevated-route

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

When Studio calls `POST /v1/sandbox/setup/elevated` with the exit code of the helper its shell ran with Windows' administrator prompt, the agent host shall answer 200 with how the setup ended, as `setupAfterHelper` says from that code and the host's own unelevated check, so the code alone never counts as done. It shall take only `{ exitCode }`, a whole number from 0 to 4,294,967,295, and refuse anything else with 400. While the host runs a setup or removal itself it shall refuse with 409 `sandbox_busy` and check nothing. A host that can't say shall not serve the route.

## Examples

- Given the helper exited with 0 and the check passes,
  when Studio calls the route with `{ exitCode: 0 }`,
  then the host answers 200 `{ ok: true }`.
- Given Studio calls the route with `{ exitCode: -1 }`,
  then the host answers 400.
- Given the host runs a setup itself,
  when Studio calls the route,
  then the host answers 409 `sandbox_busy`.
