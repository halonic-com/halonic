# agent-host.proposal-compare-routes

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, rows Q9 to Q11 of HAL-11945); `app.run-proposal-compare-choice`, `app.run-proposal-done-list`, `app.run-proposal-unavailable`

When Studio asks for the texts of a run proposal's file for Compare, the agent host shall answer the run's base, the saved text and the run's text from the run proposal service of a workspace the launcher named, with the two put together when they can be, and `seen`, the digest of the saved text (`absent` for no file). When Studio sends a choice made in Compare, it shall take from the caller only the workspace, the run's id, the file's path, `use-run` or `combine-both`, and `seen`, have the run proposal service write the text, and keep the step's undo itself as for Accept (`agent-host.proposal-decision-routes`). When Studio asks to remove a proposal whose texts are gone, it shall have the service remove it and drop the proposal's steps. When Studio asks what is done, it shall answer the workspace's proposals settled in the last 30 days. It shall answer 409 `cannot_combine` for Combine both of texts that change the same lines, and the other refusals as `agent-host.proposal-decision-routes` does.

## Examples

- Given a run that changed a file and the person's later edit of it,
  when Studio asks for the file's texts,
  then the answer holds the base, the person's text, the run's, and the digest of the person's text as `seen`.
- Given that `seen`,
  when Studio chooses `use-run` and then restores the answer's undo id to `before`,
  then the file is written with the run's text, and then back as the person left it.
- Given the person edited the file again after Compare,
  when Studio chooses `use-run` with the old `seen`,
  then the answer lists the file under `changedOnDisk` and nothing is written.
- Given both changed the same line,
  when Studio chooses `combine-both`,
  then the answer is 409 `cannot_combine` and nothing is written.
- Given a proposal whose texts are still there,
  when Studio asks to remove it,
  then the answer is 422 `proposal_refused` and the proposal stays open.
- Given the person rejected and settled a proposal,
  when Studio asks what is done,
  then the answer holds that proposal.
