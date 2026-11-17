# models.providers.check

- Status: draft
- Since: 0.1.0
- Source: flow-first-run 6.3 (HAL-663), microcopy 5; G2 of the first-run build list (HAL-1308)

The provider page of a provider that runs on this computer or your own network shall have a **Check** button that asks the provider whether it is answering, and shall show the result as one status line with the time of the check. It shall show no Check for a cloud provider or a provider with no address.

## Examples

- Given `providers/ollama.yaml` (type ollama, local) and Ollama is running,
  when the user chooses Check,
  then the button reads "Checking…" and keeps focus, and then the page says "Answering at localhost:11434 · checked 10:42".
- Given Ollama is not running, then the page says "Not answering at localhost:11434 · checked 10:42".
- Given a result, when the user chooses Check again and the result is the same, then it is announced again: "Ollama is answering at localhost:11434, checked 10:43."
- Given `providers/anthropic.yaml` (cloud), then the page has no Check; its key status answers the question.
- Given a local `openai-compatible` provider with no base URL, then the page has no Check.
- Given a provider with a Check, then under Check the page says "Small local models can miss tool calls. Run a workflow's tests to see whether yours keeps up."
