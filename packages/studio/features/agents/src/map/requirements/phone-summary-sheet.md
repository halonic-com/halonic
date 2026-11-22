# agents.map.phone-summary-sheet

- Status: draft
- Since: unreleased
- Source: HAL-13180 (PR 7); flow-agents 6 "Summary card click"; HAL-485 11.6; component specs 15.8; UX checklist 9.13

While the Studio uses its phone presentation, when a side's summary card is pressed, the agents feature shall open a panel sheet over the map instead of the drawer, titled by the side's name with Back at its top left, that lists every item of the side as a row of the stacked map and the side's add button as the last row, and move the focus to its title; when Back or Esc is pressed, it shall close the sheet and give the focus back to the summary card.

## Examples

- Given the map of "Mail triage" with 4 subagents on a phone, when "4 subagents" is pressed, then a sheet "Who it hands work to" covers the map, with Back, the rows "Writer", "Checker", "Translator", "Filer" and the row "Add subagent" last, and the focus is on its title.
- Given that sheet, when Back is pressed, then it closes and the focus is on "4 subagents".
- Given that sheet, when "Filer" is pressed, then the card "Filer" opens over the sheet; Esc closes the card first, and the sheet on the next Esc.
