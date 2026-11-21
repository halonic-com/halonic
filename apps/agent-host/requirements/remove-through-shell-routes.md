# agent-host.remove-through-shell-routes

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

When Studio removes the sandbox through its shell's helper with Windows' administrator prompt, the agent host shall serve two routes. `POST /v1/sandbox/remove/before` shall take only an empty object, do the host's half of the removal before any prompt (`removalBeforeHelper`), and answer 200 with how that went, so the shell starts the helper only after `{ ok: true }`. `POST /v1/sandbox/remove/elevated` shall take only `{ exitCode }`, a whole number from 0 to 4,294,967,295, and answer 200 with how the removal ended (`removalAfterHelper`). Both shall refuse anything else with 400. While a sandboxed run goes on, `before` shall refuse with 409 `sandbox_in_use` and how many runs, and do nothing. While the host runs a setup or removal itself, both shall refuse with 409 `sandbox_busy` and do nothing.

## Examples

- Given no run uses the sandbox,
  when Studio calls `POST /v1/sandbox/remove/before`,
  then the host takes back its kept grants and answers 200 `{ ok: true }`.
- Given one sandboxed run goes on,
  when Studio calls `POST /v1/sandbox/remove/before`,
  then the host answers 409 `sandbox_in_use` with `runs: 1` and takes nothing back.
- Given the helper exited with 36,
  when Studio calls `POST /v1/sandbox/remove/elevated` with `{ exitCode: 36 }`,
  then the host answers 200 with the removal `failed` and the code 36.
