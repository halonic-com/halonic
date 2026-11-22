# studio.workspace-done-proposals

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, HAL-11945 row Q10: the Done heading); `inbox.proposal-done`, `agent-host-client.run-proposal-done`

When the Inbox asks the open workspace for its done run proposals, Studio shall list the proposals the agent host settled in the last 30 days, each with its run's record from the workspace's run logs, or none when the run's log can't be found. It shall list none, without asking the host, while the workspace may not start runs, and none when the window has no agent host or the host doesn't serve proposals for the workspace (`not_found`, `unknown_workspace`); any other failure goes on to the Inbox.

## Examples

- Given a trusted workspace whose host settled run `01JD8Q`'s proposal yesterday,
  when the Inbox asks for the done proposals,
  then the host gets `POST /v1/proposals/done` with only the workspace, and the proposal comes with its run's record.
- Given a workspace that isn't trusted yet,
  when the Inbox asks for the done proposals,
  then there are none and the host is asked nothing.
- Given a host that answers `unknown_workspace`,
  then there are none; given one that answers `proposal_refused`,
  then the Inbox gets that failure.
