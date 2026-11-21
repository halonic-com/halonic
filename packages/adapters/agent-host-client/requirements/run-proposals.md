# agent-host-client.run-proposals

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2); `agent-host.proposal-decision-routes`

The run proposals stand-in shall list a workspace's open run proposals by asking the host's `POST /v1/proposals/list`, sending only the workspace it was made for, and give them in the host's order. It shall fail with the host's kind and reason when the host refuses, and with `answer_invalid` when a listed record isn't a proposal.

## Examples

- Given a host with one open proposal,
  when Studio lists the proposals,
  then the host gets only the workspace, and Studio gets the proposal.
- Given a host that refuses with `unknown_workspace`,
  when Studio lists the proposals,
  then the call fails with that kind.
- Given a host that lists a record that is still running,
  when Studio lists the proposals,
  then the call fails as `answer_invalid`.
