# cli.run-failure

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (the mapping, decided by Liam on the task, and the review of #1155); HAL-3810 (`server` from the provider's type); the failure lines of cli-output 3.4 at revision 28 (HAL-2718), and revision 39 for `provider-busy` without tries (HAL-2184)

The CLI shall print a failed run's two lines from the reason its `run.failed` event names and from the model the run called last, with that model's alias and provider file from the workspace. The model called last shall be the one named by the last `llm.request`, `llm.fallback` or `llm.skipped` in the run log. `key-refused` shall read as `no-key` when the run skipped that model because its key isn't set and had no other model left. `provider-busy` shall name the provider of that model, and no tries while the run log doesn't hold them. `model-missing` shall offer the Ollama download command only when the provider's type is `ollama`, and the general download fix for any other provider or when the provider file can't be found. `model-unreachable` shall name the host the event names, or else the provider's own address. A cancelled run shall get no failure lines. A reason whose lines need a fact the run log doesn't hold, a reason whose words aren't settled yet, and a model reason whose model or provider file can't be found shall get the general lines with the engine's message.

## Examples

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
- Given a run that failed with `budget`,
  when the CLI prints its failure,
  then it prints the general lines with the engine's message.
- Given a cancelled run,
  when the CLI prints how it ended,
  then it prints no failure lines.
