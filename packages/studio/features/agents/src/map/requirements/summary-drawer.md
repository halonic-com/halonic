# agents.map.summary-drawer

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 "Summary card click"; UX checklist 9.9 and 1.6 (Esc)

When a side's summary card is pressed, the agents feature shall open a drawer over the map, titled by the side's name, that lists every item of the side as its card and the side's add button last, and move the focus to its title; when Esc is pressed, after a dialog or menu above it and before a stacked card, or the empty map is pressed, it shall close the drawer and give the focus back to the summary card.

## Examples

- Given the map of "Mail triage" with 4 subagents, when "4 subagents" is pressed, then a drawer "Who it hands work to" lists "Writer", "Checker", "Translator", "Filer" and "Add subagent", and the focus is on its title.
- Given that drawer, when Esc is pressed, then it closes and the focus is on "4 subagents".
- Given that drawer, when the empty map around the cards is pressed, then it closes.
- Given that drawer, when "Filer" is pressed, then the card "Filer" opens over the map; Esc closes the card first, and the drawer on the next Esc.
