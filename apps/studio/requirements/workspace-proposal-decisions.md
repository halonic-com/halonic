# studio.workspace-proposal-decisions

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2, HAL-11945 Q6 and Q7); `inbox.proposal-page`, `agent-host-client.run-proposal-decisions`

When the Inbox accepts or rejects a run proposal's file, or every undecided file, undoes such a decision, or settles a proposal, Studio shall do it through the agent host for the open workspace, holding only the undo id the host answered. It shall give the Inbox the files an accept left alone because the person changed them after the run started, and those that can't be written. It shall refuse, without asking the host, while the workspace may not start runs (it isn't trusted yet). It shall provide these only when the window has an agent host.

## Examples

- Given a host that accepts a file and answers undo id `u1` and one file it can't write,
  when the Inbox accepts the proposal's files,
  then it gets `u1` and that file as one that can't be written.
- Given undo id `u1`,
  when the Inbox undoes the decision,
  then the host is asked to restore `u1` to `before`.
- Given a workspace that isn't trusted yet,
  when the Inbox accepts a file,
  then it fails and the agent host is not asked.
