# studio.src-tauri.remote-saves-ask

- Status: draft
- Since: unreleased
- Source: HAL-17795; follows `unfenced-allow-asks`

When the page calls `agent_host_request` with `POST /v1/remote/on`, `POST /v1/remote/allow-risky` or `POST /v1/remote/pairing/answer`, and the body's `on` or `allow` is anything but `false`, the shell shall ask the person in its own native dialog before it sends the call to the agent host: "Let phones reach this computer?" with Turn on, "Let phones answer risky approvals?" with Allow, or "Pair this phone?" with Allow. It shall send the call only when the person presses that button. When the person cancels or closes the dialog, or the platform has no dialog, the shell shall send nothing to the host, so nothing changes, and shall refuse the call as `declined`. The same calls with `false`, and any other route of the host, shall be sent without asking. The dialog shall not hold the page's other calls while it waits.

## Examples

- Given remote is off,
  when the page sends `POST /v1/remote/on` with `{ "on": true }` and the person presses Cancel in the shell's dialog,
  then the host gets no call, remote stays off, and the page gets the refusal `declined`.
- Given a phone used the pairing code and waits for Allow,
  when the page sends `POST /v1/remote/pairing/answer` with `allow: true` and the person presses Allow in the shell's dialog,
  then the shell sends the call and the host pairs the phone.
- Given phones may answer risky approvals,
  when the page sends `POST /v1/remote/allow-risky` with `{ "allow": false }`,
  then the shell sends it without asking.
