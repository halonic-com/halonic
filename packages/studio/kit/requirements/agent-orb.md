# kit.agent-orb

- Status: active
- Since: unreleased
- Source: HAL-17343; flow-agents 4.2 and 4.3; HAL-397 (the orb's sizes and rings); flow-assistant 5.3 and 6.1

The kit's `AgentOrb` shall draw an agent's character: a round orb in two colours inside a box of 16, 24 or 64px, hidden from screen readers. Its colours shall be the agent's own `character.colors`, highlight then edge, when it has them; otherwise one of the theme's five `--character-*` pairs, picked from the agent's id, so the same id always gets the same pair. Its `state` shall draw the ring inside the box, so the box keeps its size in every state: `running` for `talk`, `tool` and `work`, `running` dashed for `think`, a 1px `border-control` ring for `listen`, `warning` for `needs`, `danger` for `error`, `success` for `done`, the orb faded and no ring for `sleep`, and no ring for `idle`, the default.

## Examples

- Given an agent "triage" with no colours of its own, shown twice,
  when both orbs render,
  then both use the same `--character-*` pair, and the orb is hidden from screen readers.
- Given an agent with `character.colors` `#3B82F6` and `#8B5CF6`,
  when its orb renders,
  then its highlight is `#3B82F6` and its edge `#8B5CF6`.
- Given a 24px orb in the `think` state,
  when it renders,
  then its box is 24px and its ring is `running`, dashed.
