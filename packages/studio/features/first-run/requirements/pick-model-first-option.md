# first-run.pick-model-first-option

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, section 3.3, 6 and 8e, approved by the board on HAL-7993

When the Pick a model screen opens, the First Run feature shall tick the key option, unless Studio found a downloaded model on this computer and no key is saved for any of the three providers: then it shall tick the local option. The provider switch shall start on the first provider with a saved key, and on Anthropic when none is saved. With several downloaded models, the local option shall use `llama3.2` when it is one of them, and Ollama's first otherwise. In a window that can't test a model, only Sample answers shall be ticked or tickable.

## Examples

- Given nothing found on this computer and no key saved,
  then the key option is ticked, on Anthropic.
- Given Ollama with `qwen3:8b` and `llama3.2` downloaded and no key saved,
  then the local option is ticked, with `llama3.2`.
- Given a key saved for OpenAI and a downloaded model,
  then the key option is ticked, on OpenAI, and uses the saved key until Replace.
- Given the browser demo,
  then Sample answers is ticked, and the other two can't be.
