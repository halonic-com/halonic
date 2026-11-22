# paperclip.gh-guard-route

- Status: active
- Since: unreleased
- Source: HAL-16401, lever L1b of the part 1 plan on HAL-15920: count the guarded `gh` calls (`tools.gh_redirected`) next to `tools.calls` on the Agent tools page

When the `gh` wrapper asks the Agent tools plugin's `gh-guard` route about a status read, the plugin shall answer only an agent's run and only for one of the six guarded commands, save the metric `tools.gh_redirected` tagged with the company, the command (`subcommand`), the agent's url key (`agent`) and what the guard did (`mode`: `redirected`, `dry-run` or `exempt`), and answer `redirect: true` only while the board's setting `redirectGhStatusCalls` is on and the agent isn't listed in `ghGuardExemptAgents`. A metric that doesn't save shall not change the answer.

## Examples

- Given the setting is off,
  when Mateo's run asks about `pr checks`,
  then the plugin answers `redirect: false` and saves one `tools.gh_redirected` with `mode: "dry-run"`, `agent: "mateo"`, `subcommand: "pr checks"`.
- Given the setting is on and Mateo is listed as exempt,
  when Mateo's run asks about `run list`,
  then it answers `redirect: false` with `mode: "exempt"`.
- Given a board user, or a command such as `pr merge`,
  when the route is asked,
  then it refuses with 403 or 400 and saves nothing.
