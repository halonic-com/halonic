# app.doctor-models

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 (the Models line, and "Models checks only that a key is set") and microcopy L91

While it runs inside a workspace with model aliases, `halonic doctor` shall show a Models line. It shall list each provider the aliases use that is ready: a provider on this computer that answers, with the models it has loaded, and a provider whose key is stored. While a provider on this computer doesn't answer, the line shall be marked as failed and name the provider and its address. While an alias uses a provider whose key isn't stored, the line shall be marked as a warning and name the alias and the provider, once per alias. `doctor` shall never call a provider over the internet to check its key. A provider that needs no key, such as the mock provider, shall be neither listed nor warned about. If the workspace has no model aliases, then there shall be no Models line.

## Examples

- Given `fast` uses Ollama, which answers at localhost:11434 with llama3.2 loaded, and `smart` uses Anthropic, whose key is stored,
  then the line is ✓ and lists both.
- Given `smart` and `writer` use Anthropic, and its key isn't stored,
  then the line is ! with one problem for each alias.
- Given Ollama doesn't answer at localhost:11434,
  then the line is ✕ and names Ollama and its address, so `doctor` exits 1.
- Given Ollama doesn't answer and `smart` has no key,
  then the line is ✕, with both problems under it.
- Given `test` uses the mock provider, which needs no key,
  then the line is ✓ and doesn't name it.
- Given the workspace has no model aliases,
  then `doctor` prints no Models line.
