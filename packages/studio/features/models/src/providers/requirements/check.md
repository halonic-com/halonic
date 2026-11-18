# models.providers.check

- Status: draft
- Since: unreleased
- Source: flow-first-run 6.3 (HAL-663), microcopy 5; G2 of the first-run build list (HAL-1308)

The provider page of a provider that runs on this computer or your own network shall have a **Check** button that asks the provider whether it is answering, and shall show the result as one status line with the time of the check. When the provider isn't answering, the line shall go on to say what to do: "Start *program*, then check again.", where the program is Ollama, LM Studio, or else the provider's own name, and the screen reader shall hear the same sentence. On a phone the button shall be full width and the result shall be a chip, **Answering** (success) or **Not answering** (warning), with "at *address* · checked *time*" under it in small muted text and no dot, and the same second sentence after it when the provider isn't answering. It shall show no Check for a cloud provider or a provider with no address.

## Examples

- Given `providers/ollama.yaml` (type ollama, local) and Ollama is running,
  when the user chooses Check,
  then the button reads "Checking…" and keeps focus, and then the page says "Answering at localhost:11434 · checked 10:42".
- Given Ollama is not running, then the page says "Not answering at localhost:11434 · checked 10:42. Start Ollama, then check again."
- Given `providers/studio.yaml` (type lmstudio, local) is not running, then the line ends "Start LM Studio, then check again."; a local `openai-compatible` provider named vLLM ends "Start vLLM, then check again."
- Given a result, when the user chooses Check again and the result is the same, then it is announced again: "Ollama is answering at localhost:11434, checked 10:43."
- Given `providers/anthropic.yaml` (cloud), then the page has no Check; its key status answers the question.
- Given a local `openai-compatible` provider with no base URL, then the page has no Check.
- Given a provider with a Check, then under Check the page says "Small local models can miss tool calls. Run a workflow's tests to see whether yours keeps up."
- Given a phone and Ollama is running,
  when the user chooses Check,
  then the full-width button gives way to the chip "Answering" with "at localhost:11434 · checked 10:42" under it, and the result is announced once.
- Given a phone and Ollama is not running, then the chip reads "Not answering" with "at localhost:11434 · checked 10:42. Start Ollama, then check again." under it.
