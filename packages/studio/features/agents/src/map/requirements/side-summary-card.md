# agents.map.side-summary-card

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 "More than three"; UX checklist 9.9

When a side of the agent map has more than three items, the agents feature shall show one summary card in their place, before the side's add button, that counts the side's items by kind, leaving out the kinds it has none of, over the side's name in lower case, and joins the centre card by a line like a card.

## Examples

- Given the agent "Mail triage" run by 3 workflows and handed work by "Sorter", then its left side shows one card "3 workflows · 1 agent" over "what brings it work".
- Given it uses 2 skills, 1 knowledge source and 1 connector, then below it shows "2 skills · 1 knowledge · 1 connector" over "what it can use", then "Add a tool".
- Given it hands work to 4 agents, then on the right it shows "4 subagents" over "who it hands work to", then "Add subagent".
- Given an agent that hands work to 3 agents, then the right side shows the 3 cards.
