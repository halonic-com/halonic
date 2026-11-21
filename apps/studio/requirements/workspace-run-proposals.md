# studio.workspace-run-proposals

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2); `inbox.proposal-items`, `agent-host-client.run-proposals`

When the Inbox asks the open workspace for its run proposals, Studio shall list them from the agent host and give each with its run's record from the workspace's run logs, or none when the run's log can't be found. It shall give an item's name as the agent's, workflow's or hub's file says. It shall list none, without asking the host, while the workspace may not start runs (it isn't trusted yet). It shall list none when the window has no agent host, or the host doesn't serve proposals for the workspace (`not_found`, `unknown_workspace`), and pass any other failure on to the Inbox. It shall read the run logs only when there is a proposal.

## Examples

- Given a proposal of a run in the workspace and one whose log is gone,
  when the Inbox asks for the proposals,
  then the first comes with its run's record and the second without one, and the agent's name is the one its file says.
- Given a window without the agent host, or a host with no proposals,
  when the Inbox asks for the proposals,
  then there are none and no run log is read.
- Given a workspace that isn't trusted yet,
  when the Inbox asks for the proposals,
  then there are none and the agent host is not asked.
- Given a host that answers `not_found` or `unknown_workspace`,
  then there are none; given one that answers `proposal_refused`,
  then the Inbox gets that failure.
