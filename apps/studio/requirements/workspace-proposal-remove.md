# studio.workspace-proposal-remove

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, HAL-11945 row Q11: branch gone); `inbox.proposal-page-states`, `agent-host-client.run-proposal-remove`

When the agent host refuses a decision on a run proposal because its texts are gone (`proposal_unavailable`), Studio shall tell the Inbox the proposal is gone. When the Inbox removes such a proposal, Studio shall have the agent host remove it for the open workspace, sending only the workspace and the run's id, and refuse without asking the host while the workspace may not start runs.

## Examples

- Given a host that answers an accept with 409 `proposal_unavailable`,
  when the Inbox accepts a file,
  then the call fails as gone, with the host's message.
- Given a trusted workspace,
  when the Inbox removes run `01JD8Q`'s proposal,
  then the host gets `POST /v1/proposals/remove` with only the workspace and `01JD8Q`.
- Given a workspace that isn't trusted yet,
  when the Inbox removes a proposal,
  then the call is refused and the host is asked nothing.
