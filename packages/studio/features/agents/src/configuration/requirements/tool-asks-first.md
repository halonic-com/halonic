# agents.configuration.tool-asks-first

- Status: draft
- Since: unreleased
- Source: HAL-18932 (T6 gap 7, HAL-17270); flow-agents 5.2 (Tools: "connector tools with approval show the approval hand"); the words of `agents.map.asks-first` (microcopy 19.7, HAL-15628)

Where an agent uses a connector the hub can use, the Tools page shall show on its chip the approval hand with the words "Every tool asks first" when none of its tools can run without asking by the engine's rule, else "Asks first, except N read-only tools", as the agent map's card does.

## Examples

- Given the agent uses the connector "Acme mail", none of whose tools can run without asking, then its chip shows the approval hand (the kit's drawn `HandIcon`) and "Every tool asks first", and its ✕ is still named "Remove Acme mail".
- Given one of its tools is read-only and doesn't ask, then its chip shows "Asks first, except 1 read-only tool".
- Given a skill chip, then it shows no hand.
