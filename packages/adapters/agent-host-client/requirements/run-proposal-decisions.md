# agent-host-client.run-proposal-decisions

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2, HAL-11945 Q6 and Q7); `agent-host.proposal-decision-routes`

The run proposals stand-in shall accept or reject a file of a run's proposal, or every undecided file, through the host's `POST /v1/proposals/accept` and `…/reject`, undo or redo such a decision through `…/restore`, and settle a proposal through `…/settle`. It shall send only the workspace it was made for, the run's id, the file's path or `all`, and for an undo or redo the id the host answered and the direction, never an undo step's texts. It shall fail with the host's kind and reason when the host refuses, and with `answer_invalid` when an answer isn't what the route gives.

## Examples

- Given a host that accepts a file and answers its undo id,
  when Studio accepts that file,
  then the host gets only the workspace, the run's id and the file, and Studio gets the id and what was written.
- Given that undo id,
  when Studio undoes the accept,
  then the host gets only the workspace, the id and `before`.
- Given a host that answers `settled`,
  when Studio settles the proposal,
  then Studio gets `settled`.
- Given a host that refuses with `unknown_undo`,
  when Studio undoes a decision,
  then the call fails with that kind.
- Given a host whose accept answer has no undo id,
  when Studio accepts a file,
  then the call fails as `answer_invalid`.
