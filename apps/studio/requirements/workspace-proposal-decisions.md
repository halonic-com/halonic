# studio.workspace-proposal-decisions

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2, HAL-11945 Q6 and Q7); `inbox.proposal-page`, `agent-host-client.run-proposal-decisions`

When the Inbox accepts or rejects a run proposal's file, or every undecided file, undoes such a decision, or settles a proposal, Studio shall do it through the agent host for the open workspace, holding only the undo id the host answered. It shall give the Inbox the files an accept left alone because the person changed them after the run started, and those that can't be written, and after an undo the files the host left as they were and whether a later decision kept the whole undo back. It shall refuse, without asking the host, while the workspace may not start runs (it isn't trusted yet), and say so as `untrusted`. It shall sort any other failure, except a proposal whose texts are gone, by the error's type and the host's kind, never its text: a host that isn't answering as `not-answering`, and every other one as a reason Halonic can't explain, keeping the host's words for **Copy details**. It shall provide these only when the window has an agent host.

## Examples

- Given a host that accepts a file and answers undo id `u1` and one file it can't write,
  when the Inbox accepts the proposal's files,
  then it gets `u1` and that file as one that can't be written.
- Given undo id `u1`,
  when the Inbox undoes the decision,
  then the host is asked to restore `u1` to `before`, and the files it answers it left alone (changed on disk or refused) reach the Inbox, with whether a later decision kept it back.
- Given a workspace that isn't trusted yet,
  when the Inbox accepts a file,
  then it fails as `untrusted` and the agent host is not asked.
- Given a host that refuses an accept with 422 `proposal_refused`,
  when the Inbox accepts a file,
  then it fails as a reason Halonic can't explain, with the host's words as its details.
