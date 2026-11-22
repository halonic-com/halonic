# runs.sample-chip

- Status: active
- Since: unreleased
- Source: HAL-13435 (first-run-flow 3.5, decision R5)

When every model call of a run that waits or is done went to the built-in test model (a provider whose file says `type: mock`, whatever its id), the Studio shall show the "Sample answers" chip on that run's Inbox wait card, above its title, and on its row in the Runs list, after the title and on a phone under the line, and the row's sentence shall end with "on Sample answers". The Studio shall read this from the run's own log, not from the workspace's current model, so a run keeps its chip, or keeps none, after the model is changed. A run that mixed the test model with a real one, a run that made no model call, and a test case's run shall carry no chip. The answer for an ended run shall be kept for its open workspace; a run that still waits shall be read again each time its card opens.

## Examples

- Given a run of Support reply whose one model call went to the provider `mock` of `type: mock`, waiting at "Approve this reply?",
  when its Inbox card opens,
  then "Sample answers" shows above the title "Approve this reply?",
  and its row in the Runs list shows "Sample answers" and its sentence ends "…, 10:40, on Sample answers.".
- Given that run, after a real model was picked in the header,
  when its card opens again,
  then it still shows "Sample answers".
- Given a run whose provider is called `scripted` and has `type: mock`,
  when its row is shown,
  then it carries the chip; a provider with the id `mock` but `type: ollama` carries none.
- Given a run whose first call went to the test model and whose second went to `claude`, a key's model,
  when its row is shown,
  then it carries no chip, and its path is `cloud`; with Ollama for the second call, it is `local`.
- Given a test case's run on the test model,
  when its row is shown,
  then it carries the Test tag and no Sample answers chip.
- Given a done run on the test model whose log was read once,
  when its row is shown again,
  then its log isn't read again.
