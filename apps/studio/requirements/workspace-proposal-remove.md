# studio.workspace-proposal-remove

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, HAL-11945 row Q11: branch gone); `inbox.proposal-page-states`, `agent-host-client.run-proposal-remove`; a failed Remove by its kind, C681 row 32 (HAL-16161)

When the agent host refuses a decision on a run proposal because its texts are gone (`proposal_unavailable`), Studio shall tell the Inbox the proposal is gone. When the Inbox removes such a proposal, Studio shall have the agent host remove it for the open workspace, sending only the workspace and the run's id, and refuse without asking the host while the workspace may not start runs. When the Remove fails, Studio shall tell the Inbox why by the error's type and the host's kind, never its text, which it keeps only for **Copy details**: the host's `proposal_refused` as the changes being there again, a host that isn't running (`AgentHostNotAnswering`) as the engine not answering, and any other failure as one Halonic can't explain.

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
- Given a host that answers the Remove with 422 `proposal_refused`,
  when the Inbox removes run `01JD8Q`'s proposal,
  then the call fails as the changes being there again, with the host's message for details only.
