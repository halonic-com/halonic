# studio.workspace-proposal-compare

- Status: active
- Since: unreleased
- Source: HAL-16056 (C666 #1: a file changed since the run had no way out in Studio); HAL-11945 row Q9; `inbox.proposal-compare`, `agent-host-client.run-proposal-compare`

When the Inbox opens Compare on a file of a run proposal, Studio shall read the file's saved and run's texts from the agent host for the open workspace and tell the Inbox whether Combine both can put them together. When the Inbox sends a choice made in Compare, Studio shall send only the run, the path, the choice and the `seen` Compare gave, and give back what was written, what was left alone because it changed again, and what can't be written, as for Accept. Both shall be refused without asking the host while the workspace may not start runs, and a proposal whose texts are gone shall fail as gone (`studio.workspace-proposal-remove`).

## Examples

- Given a host whose texts of `notes.md` can't be combined,
  when the Inbox opens Compare on it,
  then it gets both texts, `seen`, and that Combine both isn't offered.
- Given the same host,
  when the Inbox chooses Use the run's,
  then the host gets `POST /v1/proposals/choose` with the workspace, the run, `notes.md`, `use-run` and `seen`, and no text.
- Given a workspace that isn't trusted yet,
  when the Inbox opens Compare,
  then the call is refused and the host is asked nothing.
