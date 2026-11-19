# agent-host.placement-routes

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `ports.agent-placement-store`

When Studio asks for, saves or removes an agent's "this computer" choice, the agent host shall do it in the placements folder of the person's profile, the CLI's own, for a workspace the launcher named. It shall take the choice or the key, with the agent's hub, and nothing else; it shall refuse a body without the hub with 400, and shall refuse a location that isn't the real path of a named workspace with 404 `unknown_workspace`, reading and writing nothing. It shall answer 422 `placement_unreadable` with the reason for a choice that exists but can't be read, and never answer such a choice as none.

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
- Given a body without the agent's hub,
  then the answer is 400 and nothing is read or written.
- Given a choice saved for an agent in one hub,
  when Studio asks for the same agent id in another hub,
  then the answer is `{ placement: null }`.
