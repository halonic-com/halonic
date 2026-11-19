# cli.run-failure

- Status: active
- Since: 0.1.0
- Source: HAL-12342 (a provider type Halonic can't call, decided by Liam on the task); HAL-12034 (a tiny amount in the budget lines reads "less than €0.001", decided by Liam with Kim on the task); HAL-12012 (`budget` from the engine's cause first, decided by Liam on the task); HAL-12007 (`budget` from the engine's error, decided by Liam on the task); HAL-6451 (no bug report line for a known cause, decided by Liam on the task); HAL-3814 (the mapping, decided by Liam on the task, and the review of #1155); HAL-3810 (`server` from the provider's type); the failure lines of cli-output 3.4 at revision 28 (HAL-2718), and revision 39 for `provider-busy` without tries (HAL-2184)

The CLI shall print a failed run's two lines from the reason its `run.failed` event names and from the model the run called last, with that model's alias and provider file from the workspace. The model called last shall be the one named by the last `llm.request`, `llm.fallback` or `llm.skipped` in the run log. `key-refused` shall read as `no-key` when the run skipped that model because its key isn't set and had no other model left. `provider-busy` shall name the provider of that model, and no tries while the run log doesn't hold them. `model-missing` shall offer the Ollama download command only when the provider's type is `ollama`, and the general download fix for any other provider or when the provider file can't be found. `model-unreachable` shall name the host the event names, or else the provider's own address. `model-timeout` shall name the provider and "5 minutes", and for a provider on this computer also the address, from the event's host or else the provider's own. A cancelled run shall get no failure lines. `budget` shall take the budget, the spend and the currency from the `budget.run` or `budget.month` cause of the event (`engine.budget-stops`), and from the engine's error (`engine.budget-stop-message`) for a log written before the cause, also when a parent run wraps it, and a monthly budget shall reset on the first of the month after the run stopped (UTC). A reason whose lines need a fact the run log doesn't hold, a `budget` error that doesn't read as the engine writes it, `harness-unavailable` (cli-output 3.4 has no line for it), and a model reason whose model or provider file can't be found shall get the general lines with the engine's message. An `error` whose cause is `models.unknown-provider-type` with the provider and its type shall name both on line 1, and on line 2 the provider's file and every type Halonic can call, from the list the engine builds providers from, with no bug report line. Of those, `disk-full`, `interrupted` and `answer-not-an-option` shall get line 1 only, without the general line 2 that asks for a bug report, because their cause is known.

## Examples

- Given a run that failed with `error` and the cause `models.unknown-provider-type` for the provider `weird` of type `carrier-pigeon`,
  when the CLI prints its failure,
  then line 1 says "provider weird has type carrier-pigeon, which Halonic can't call." and line 2 says "Set type in providers/weird.yaml to one of anthropic, openai, openai-compatible, ollama, lmstudio or mock, then run again."
- Given a run that failed with `model-missing` after calling `llama3.2` through the alias `local` at a provider of type `ollama`,
  when the CLI prints its failure,
  then line 2 says "Run ollama pull llama3.2, or point the model alias local at another model in models.yaml."
- Given the same run at a provider of type `lmstudio`, or at a provider without a file,
  when the CLI prints its failure,
  then line 2 says to download the model in that provider instead.
- Given a run that failed with `key-refused` after skipping the only model for want of its key,
  when the CLI prints its failure,
  then line 1 says there's no key in the provider's secret.
- Given a run that failed with `provider-busy` after calling a model at OpenAI,
  when the CLI prints its failure,
  then line 1 ends "OpenAI was busy and asked Halonic to slow down." and line 2 says "Run it again in a few minutes."
- Given a run that failed with `model-timeout` after calling a model at Ollama on `localhost:11434`,
  when the CLI prints its failure,
  then line 1 says Ollama didn't start answering at `localhost:11434` within 5 minutes and that it may still be loading the model, and line 2 says to run it again in a few minutes.
- Given a run that failed with `budget` and the error `Run budget reached: 0.0740 of 0.0001 EUR spent.`,
  when the CLI prints its failure,
  then line 1 says the run stopped because it reached its budget, with the estimated spend, and line 2 says "Raise budget.perRun in workspace.yaml."
- Given a run that failed with `budget` and the error `Run budget reached: 0.0004 of 0.00001 EUR spent.`,
  when the CLI prints its failure,
  then line 1 says "this run reached its budget of less than €0.001 (estimated less than €0.001 spent)", because "budget of under" reads oddly.
- Given a run whose child run failed with `budget` and the wrapped error `Workflow "draft-twice" failed: Monthly budget reached: 0.60 of 0.50 EUR spent this month.` on 31 December,
  when the CLI prints its failure,
  then line 2 says "Raise budget.monthly in workspace.yaml, or wait until it resets on 1 Jan."
- Given a run that failed with `disk-full`, `interrupted` or `answer-not-an-option`,
  when the CLI prints its failure,
  then it prints the general line 1 with the engine's message and no line 2.
- Given a cancelled run,
  when the CLI prints how it ended,
  then it prints no failure lines.
