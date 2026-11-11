# app.review-try-it-cant-try

- Status: active
- Since: 0.1.0
- Source: AI changes 1.5 (HAL-3228); HAL-65 section F, `workspace.trust.try-it-leaves-out` (HAL-3268, HAL-3341); the run status agreed on HAL-4285; HAL-3277

When Try it or Test asks the review service for its source for one workflow or agent, the service shall count as left out only the files that item's run reads: the item, the agents and workflows its steps call, what those agents name, the workspace settings, models, providers and runtimes, and the item's `hub.yaml`. It shall also list each step the run can't try because a change is left out, so the run never quietly uses the change:

- a step whose files have an error only as Try it reads them, in a file that isn't left out, needs a left-out change: it names the left-out file that change is in, with that file's reason. It names first a left-out file of the kind the error is about that the step reads, then one of that kind elsewhere in the run, then any left-out file the step reads;
- such an error in a left-out file means the item doesn't load without the change: it names the file and the error;
- when the item itself is left out and doesn't load as Try it reads it, the whole item can't be tried: it needs the change, or, when its baseline has an error, it names that error.

An error in a file no single step reads, or in an agent being tried, applies to the whole item. Errors the workspace has as it is aren't listed, nor errors in settings this run doesn't read: the assistant's model in `workspace.yaml`, and an alias in `models.yaml` that none of the run's models name or fall back to.

The service shall compare the two from one read of each file, so a file saved while it builds them doesn't show up as a difference.

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
- Given before trust the assistant added method `summarize` to agent `writer`, and after trust raised agent `sorter`'s step limit and made step `reply` call `writer.summarize`,
  when Try it asks for its source for `triage`,
  then step `reply` can't be tried: it needs the left-out change in `writer`, not the one in `sorter`.
- Given the assistant added the alias `large` and made it the assistant's model,
  when Try it asks for its source for `triage`,
  then every step can be tried, and `models.yaml` is left out.
- Given the person added the alias `spare` on provider `cloud`, which the assistant added and is left out, and no agent uses `spare`,
  when Try it asks for its source for `triage`,
  then every step can be tried.
