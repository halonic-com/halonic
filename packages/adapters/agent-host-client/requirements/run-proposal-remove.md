# agent-host-client.run-proposal-remove

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, HAL-11945 row Q11: branch gone); `agent-host.proposal-compare-routes`

The run proposals stand-in shall remove a run's proposal whose texts are gone through the host's `POST /v1/proposals/remove`, sending only the workspace it was made for and the run's id. It shall fail with the host's kind and reason when the host refuses, and with `answer_invalid` when the answer isn't the empty object the route gives.

## Examples

- Given a host that removes the proposal,
  when Studio removes run `01JD8Q`'s proposal,
  then the host gets only the workspace and `01JD8Q`.
- Given a host that refuses with `proposal_refused` because the texts are still there,
  when Studio removes the proposal,
  then the call fails with that kind.
