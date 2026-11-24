# agents.map.stacked

- Status: draft
- Since: unreleased
- Source: HAL-15012 (C525-5); HAL-17218 (C46 AG1); HAL-13180 (PR 7); component specs 15.8; flow-agents 6; UX checklist 9.9; HAL-15960 (C657 row 1)

When the agent map's panel is narrower than 43.5 rem, where 0.8 of the map's natural 54 rem doesn't fit, or narrower than 22.5 rem on the phone presentation (`agents.map.phone-columns`), the agents feature shall show the map stacked: its sides one under the other in the reading order, left, centre, below, right, at their natural size and with the same groups, cards, add buttons and Tab order, with no lines and no fit, so nothing runs off the panel's right edge; each group shall be the kit's List heading over one flush list, each item a row at least 56 pixels high with its kind's 20-pixel icon (routines, workflows, agents, or library for a skill, knowledge or connector) before its name over its kind and detail and, when it opens something, a chevron at its right edge, a side with more than three items a summary row in their place, with no icon and its text lined up with the names, and the side's add button a 48-pixel row after them; the agent shall be a card inset 16 pixels with its name as a section title and its agent steps as rows at least 48 pixels high; when the panel is that wide again, it shall fit the map as `agents.map.lines-and-fit` says.

## Examples

- Given a panel 390 pixels wide at 16-pixel text, then the map shows "What brings it work", the centre card "Mail triage", "What it can use" and "Who it hands work to" one under the other, with no lines, and the page doesn't scroll sideways.
- Given a panel 589 pixels wide at 16-pixel text, such as a narrowed panel beside the chat, then the map is stacked, so "Who it hands work to" and "+ Add subagent" aren't cut off at the right; in the chat's default 700-pixel panel the map is fitted, at 0.81 of its size.
- Given the stacked map, when the panel grows to 702 pixels, then 260 ms later the map is fitted again and its lines are drawn.
- Given 200 % text, then the map is stacked in a panel narrower than 1392 pixels.
- Given a phone 352 pixels wide, then the map is stacked; 360 pixels wide, it shows in three columns.
- Given the stacked map, then the workflow "Support reply" is a row with the workflows icon, reading "Support reply" over "Workflow · sort, reply", and "Who it hands work to" with four subagents shows the row "4 subagents" with a chevron, then the add row "Add subagent".
