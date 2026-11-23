# studio.src-tauri.unfenced-allow-asks

- Status: draft
- Since: unreleased
- Source: HAL-16466; follows `sandbox-choice-save-asks`

When the page calls `agent_host_request` with `POST /v1/unfenced-runs/allow`, the shell shall ask the person in its own native dialog, "Allow plugins and integrations to run without the sandbox?", before it sends the call to the agent host, and shall send it only when the person presses Allow. When the person cancels or closes the dialog, or the platform has no dialog, the shell shall send nothing to the host, so no yes is saved, and shall refuse the call as `declined`. Any other route of the host shall be sent without asking. The dialog shall not hold the page's other calls while it waits.

## Examples

- Given plugins need a yes to run without the sandbox,
  when the page sends `POST /v1/unfenced-runs/allow` and the person presses Cancel in the shell's dialog,
  then the host gets no call, no yes is saved, and the page gets the refusal `declined`.
- Given plugins need a yes to run without the sandbox,
  when the page sends `POST /v1/unfenced-runs/allow` and the person presses Allow,
  then the shell sends the call and the host saves the yes for the reason that holds now.
- Given the page sends `POST /v1/unfenced-runs/take-back`,
  then the shell sends it without asking.
