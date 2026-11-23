# agent-host-client.run-proposal-compare

- Status: active
- Since: unreleased
- Source: HAL-16056 (C666 #1: a file changed since the run had no way out in Studio); HAL-11945 row Q9 (Compare); `agent-host.proposal-compare-routes`

The run proposals stand-in shall read a file's texts for Compare through the host's `POST /v1/proposals/compare`, sending only the workspace it was made for, the run's id and the file's path, and give back the host's `base`, `saved`, `run`, `combined` and `seen`, with `refused` only when the host names it. It shall send a choice made in Compare through `POST /v1/proposals/choose` with only the workspace, the run's id, the path, the choice and `seen`, never a text, and give back the answer as Accept does. It shall fail with the host's kind and reason when the host refuses, and with `answer_invalid` when an answer isn't the route's.

## Examples

- Given a host that answers the texts of `notes.md`,
  when Studio compares `notes.md` of run `01JD8Q`,
  then the host gets only the workspace, `01JD8Q` and `notes.md`, and Studio gets the texts and `seen`.
- Given the same host,
  when Studio chooses Use the run's with the `seen` Compare gave,
  then the host gets only the workspace, `01JD8Q`, `notes.md`, `use-run` and that `seen`.
- Given a host that refuses Combine both with `cannot_combine`,
  when Studio chooses Combine both,
  then the call fails with that kind.
