# server.waiting-run-context

- Status: active
- Since: unreleased
- Source: HAL-19450 (the served Studio's wait card, HAL-19383 gap G3); server.waiting-runs

When the host gives the workspace's workflows and test models (`workspace.waitFacts()`), the server shall add to its answer to `GET /api/waiting-runs` a `context` object that, by run id, says for each listed run: `workflow`, the workflow's name, or its id when the workspace no longer has it; `description`, the description of the step the run waits at as the workflow file writes it, left out when not known; `startInput`, the text the run started with in its workflow's `start.field`, left out when there is none; and `sample`, whether every model call in the run's log went to the test model, decided as the CLI and Studio decide "Sample answers". When the workspace's facts can't be read, `context` shall be empty; when one run's log can't be read, that run shall be left out of `context`. Either way the cause goes to the error log and the runs are still listed. Without `workspace.waitFacts()` the answer has no `context`.

Rationale: a served page can't read the workflow files or the run's log, and the wait card needs them to say what an answer is about (`studio.served-wait-context`).

## Examples

- Given Acme's run of Support reply on the test model, started with an email in `mail` and waiting at `review`, when the list is read, then its `context` is `{ "workflow": "Support reply", "description": "Approve this reply?\n{{context.reply}}\n\nApproving finishes the run. Nothing is sent.", "startInput": "<the email>", "sample": true }`.
- Given a run whose workflow file was removed, then its `context` names the workflow by its id, with no `description` or `startInput`.
- Given the workflow files can't be read, then the list still answers the runs, with `"context": {}`.
