# models.budget-step.never-for-local

- Status: draft
- Since: 0.1.0
- Source: flow-models 4.1 (HAL-177), HAL-63 (B3, B4)

The models feature shall not offer the Prices and budget step for a provider that can't bill per use: one on this computer with no key, or one on a private network with no key. Its aliases show "No price" instead.

## Examples

- Given Ollama on `http://localhost:11434/v1` with no key, then no step is offered.
- Given LM Studio on `http://192.168.1.20:1234/v1` with no key, then no step is offered.
