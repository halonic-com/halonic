# studio.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 10–13 (HAL-12232); task HAL-12237; requirement `agent-host-client.remote-control`

When Studio runs in the desktop app, it shall give Settings › Remote the agent host's `RemoteControl` over the host's routes, so the host keeps remote's rules and the paired phones and Studio only shows and asks. When the page isn't in the desktop app, Studio shall give no `RemoteControl`, and so shall show no Remote section.

## Examples

- Given the desktop app, when a workspace opens, then Settings › Remote follows the host's remote state, and shows nothing while the host says remote isn't available.
- Given a page outside the desktop app, then nothing provides a `RemoteControl`.
