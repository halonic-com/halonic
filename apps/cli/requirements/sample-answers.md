# cli.sample-answers

- Status: active
- Since: unreleased
- Source: HAL-16187, from the C684 flow check on HAL-16182 (finding 4): the CLI says what Studio's "Sample answers" chip says (`runs.sample-chip`, HAL-13435). Wording and place decided by the team (small wording, HAL-2282)

When every model call of a run went to a provider whose file says `type: mock`, whatever its id, `halonic run`, `halonic runs send` and `halonic runs show` shall say "On Sample answers: the built-in test model wrote this run's answers, not a real model." dimmed, on its own line after the step lines and a blank line, and before the run's ending; the `halonic runs` list shall show "Sample answers" after the run's workflow, as "Support reply · Sample answers". With `--json`, each run of `halonic runs` and the run of `halonic run` and `halonic runs send` shall carry `sampleAnswers`, and `halonic runs show` shall carry it next to the events: `true` for such a run, `false` for any other. The CLI shall read this from the run's own log, so a run keeps its answer after the workspace's model changes. A run that made no model call, one that mixed the test model with a real one, and one that called a provider the workspace no longer has are not on Sample answers. It shall not change the exit code.

## Examples

- Given Acme, whose provider `mock` has `type: mock`,
  when `halonic run support-reply` waits at "Approve this reply?",
  then the line comes after the step lines and before "! Waiting for you: Approve this reply?", and `--json` has `"sampleAnswers": true` on the run.
- Given a finished run whose calls went to the provider `scripted` of `type: mock`,
  when `halonic runs` lists it,
  then its row reads "Support reply · Sample answers", and `halonic runs show` has the line after its step lines.
- Given a run whose first call went to the test model and whose second went to `claude`, a key's model,
  when it is listed or shown,
  then it carries no tag and no line, and `--json` has `"sampleAnswers": false`; the same for a provider with the id `mock` but `type: ollama`, and for a run that made no model call.
