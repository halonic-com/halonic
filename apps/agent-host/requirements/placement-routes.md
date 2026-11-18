# agent-host.placement-routes

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `ports.agent-placement-store`

When Studio asks for, saves or removes an agent's "this computer" choice, the agent host shall do it in the placements folder of the person's profile, the CLI's own, for a workspace the launcher named. It shall take the choice or the key and nothing else, and shall refuse a location that isn't the real path of a named workspace with 404 `unknown_workspace`, reading and writing nothing. It shall answer 422 `placement_unreadable` with the reason for a choice that exists but can't be read, and never answer such a choice as none.

## Examples

- Given a named workspace and no choice,
  when Studio asks for the agent's choice,
  then the answer is `{ placement: null }`.
- Given a saved choice,
  when Studio asks for it,
  then the answer is the choice, and removing it makes the next answer `null`.
- Given a location the launcher did not name,
  when Studio saves a choice for it,
  then the answer is 404 `unknown_workspace` and nothing is written.
- Given a choice file that is damaged,
  when Studio asks for it,
  then the answer is 422 `placement_unreadable`.
- Given a body with a field the route does not know,
  then the answer is 400.
