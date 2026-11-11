# workspace.references

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error every name a file gives that no parsed file of the right kind has where the name is looked up, with the file, the key path and line of the name, and the old loader's message, except the assistant model's, which names `assistant.model` and `models.yaml` (parity difference `assistant-model-alias-message`). A file that failed its own checks shall count as missing; the agents of a hub whose `hub.yaml` failed shall not be checked, as the old loader left that hub out. The names are an agent's model aliases (its own and its methods'), skills, knowledge, collections, connectors and subagents; the providers and fallback aliases in `models.yaml`; the assistant model alias in `workspace.yaml` (`assistant.model`); and the workflow a workflow test targets.

An agent's skills, knowledge, collections and connectors are the hub's own or shared at the root; a hub that lists `uses` may use only the shared items it lists there. Model aliases are those of `models.yaml` and the hub's own. Subagents and a test's workflow are looked up in the same hub. A model given as `provider/model` is not an alias and isn't looked up.

## Examples

- Given each of the parity cases `agent/unknown-model`, `agent/unknown-method-model`, `agent/unknown-skill`, `agent/unknown-knowledge`, `agent/unknown-collection`, `agent/unknown-connector`, `agent/unknown-subagent`, `agent/own-subagent`, `hub/uses-leaves-out`, `models/unknown-provider`, `models/unknown-fallback` and `workflowTest/unknown-workflow`, when it is loaded, then it gives exactly the error the old loader recorded, at the key path and line its case file names.
- Given the parity case `workspace/unknown-model`, when it is loaded, then it gives the error `The assistant model (assistant.model) uses "turbo", which isn't an alias in models.yaml.` at the file, key path and line its case file names.
- Given the parity case `models/wrong-type`, whose `models.yaml` fails, when it is loaded, then the agents `clerk` and `notifier` and the assistant model each use an unknown model alias.
- Given each of the parity cases `hub/wrong-type`, `hub/missing-required`, `hub/unknown-key` and `hub/deep-nesting`, whose `hub.yaml` fails, when it is loaded, then no check reports an error for the hub's agents.
- Given a hub without `uses` and an agent with a shared skill and one of the hub's own, when it is loaded, then there is no error.
- Given an agent at the root with the model `careful`, which only a hub defines, when it is loaded, then it uses an unknown model alias; an agent with `mock/echo` gets no error.
- Given a hub agent with a subagent that exists only at the root, when it is loaded, then it delegates to an unknown agent.
