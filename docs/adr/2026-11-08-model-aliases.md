# Model aliases

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Agents are written once and shared. Model names change, providers differ per
team, and a team may want a cheaper or local model for the same agent.

## Decision

An agent names an alias, such as `fast` or `smart`, never a provider or a model.
`models.yaml` maps each alias to a provider, a model and its parameters, with
fallbacks to try in order. A hub can override aliases for its own agents.

`@halonicjs/workspace` resolves aliases when it loads a workspace. The engine
calls the model through the model port with the resolved provider and model.

## Consequences

- Changing a model is a change to one file, not to every agent.
- Sharing an agent doesn't share anyone's provider choice or key.
- A workspace check reports an alias that no file defines.
