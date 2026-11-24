# agent-host.plugin-tools-in-build

- Status: active
- Since: unreleased
- Source: HAL-17815; C3 option (a) on HAL-12374, approved by the board on 24 Nov (plugin cards and commands hidden where plugin tools are off); the single executable's refusal is `agent-host.plugin-routes`

When Studio asks whether this build runs plugin tools, the agent host shall answer `{ inThisBuild: false }` if it is the shipped single executable, which refuses every plugin call with `not_in_this_build`, and `{ inThisBuild: true }` otherwise, as a code only. The route shall read no disk and start nothing. The agent host shall serve it only behind the launch token, and only where it serves the plugin routes; it shall answer 401 without the token.

## Examples

- Given the shipped single executable with a profile folder,
  when Studio asks whether this build runs plugin tools,
  then the answer is `{ inThisBuild: false }`.
- Given the host run by Node from its sources,
  when Studio asks,
  then the answer is `{ inThisBuild: true }`.
- Given a request without the launch token or with a wrong one,
  when it reaches the route,
  then the answer is 401.
