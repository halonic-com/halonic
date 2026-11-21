# agent-host.proposal-decision-routes

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, flow-inbox 2.2); `app.run-proposal-list`, `app.run-proposal-accept`, `app.run-proposal-reject`, `app.run-proposal-done`

When Studio asks to list a workspace's open run proposals, accept or reject a proposal's files, undo or redo such a decision, or settle a proposal, the agent host shall do it with the run proposal service of a workspace the launcher named. It shall take from the caller only the workspace, the run's id, a file's path or `all`, and for an undo or redo the id the host gave for that decision, and shall keep each decision's undo step itself, so that it writes only texts the run proposal service produced. It shall restore a step only for the workspace that made it, and shall drop a proposal's steps once it is settled. It shall answer 404 `unknown_workspace` for a workspace the launcher did not name, 404 `unknown_proposal` for a run with no proposal, 404 `unknown_undo` for a step it doesn't keep for that workspace, 409 `proposal_unavailable` when the proposal's texts are gone, and 422 `proposal_refused` with the reason for anything else the service refuses.

## Examples

- Given a run that changed a file,
  when Studio lists the workspace's proposals,
  then the answer holds the run's proposal with the file undecided.
- Given that proposal,
  when Studio accepts the file and then restores the answer's undo id to `before`,
  then the file is written with the run's text, and then back as it was.
- Given that proposal,
  when Studio rejects it and settles it,
  then the file is left alone, the answer is `settled`, the list is empty, and the reject's undo id is unknown.
- Given an undo id the host gave for one workspace,
  when Studio restores it for another named workspace,
  then the answer is 404 `unknown_undo` and nothing is written.
- Given a run with no proposal, or a folder the launcher did not name,
  then the answer is 404 and nothing is written.
- Given a body with a field the route does not know, such as an undo step's texts,
  then the answer is 400.
