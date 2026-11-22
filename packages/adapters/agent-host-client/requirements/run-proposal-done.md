# agent-host-client.run-proposal-done

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, HAL-11945 row Q10: the Done heading); `agent-host.proposal-compare-routes`

The run proposals stand-in shall list the proposals the host settled in the last 30 days through the host's `POST /v1/proposals/done`, sending only the workspace it was made for, and give each record as the host answered it. It shall fail with the host's kind and reason when the host refuses, and with `answer_invalid` when a record isn't a proposal.

## Examples

- Given a host with one proposal settled yesterday,
  when Studio lists the done proposals,
  then the host gets only the workspace, and the record comes back with when and why it was settled.
- Given a host that answers a record still running,
  when Studio lists the done proposals,
  then the call fails as `answer_invalid`.
