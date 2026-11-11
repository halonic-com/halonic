# app.review-try-it-cant-try

- Status: active
- Since: 0.1.0
- Source: AI changes 1.5 (HAL-3228); HAL-65 section F, `workspace.trust.try-it-leaves-out` (HAL-3268, HAL-3341); the run status agreed on HAL-4285; HAL-3277

When Try it or Test asks the review service for its source for one workflow or agent, the service shall count as left out only the files that item's run reads: the item, the agents and workflows its steps call, what those agents name, the workspace settings, models, providers and runtimes, and the item's `hub.yaml`. It shall also list each step the run can't try because a change is left out, so the run never quietly uses the change:

- a step whose files have an error only as Try it reads them, in a file that isn't left out, needs a left-out change: it names the left-out file that change is in, with that file's reason;
- such an error in a left-out file means the item doesn't load without the change: it names the file and the error;
- when the item itself is left out, the whole item can't be tried.

An error in a file no single step reads, or in an agent being tried, applies to the whole item. Errors the workspace has as it is aren't listed.

## Examples

- Given the assistant added the alias `large` to `models.yaml` and switched agent `writer` to it,
  when Try it asks for its source for workflow `triage`, whose step `reply` runs `writer`,
  then step `reply` can't be tried: it needs the left-out change in `models.yaml`.
- Given the assistant added connector `mail` and gave it to agent `sorter`,
  when Try it asks for its source for `triage`,
  then every step can be tried, `sorter` without `mail`, and both files are left out.
- Given the assistant changed agent `clerk` of hub `billing`,
  when Try it asks for its source for `triage` in hub `support`,
  then nothing is left out of that run.
