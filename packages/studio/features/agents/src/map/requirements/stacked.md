# agents.map.stacked

- Status: draft
- Since: unreleased
- Source: HAL-15012 (C525-5); HAL-13180 (PR 7); flow-agents 6; UX checklist 9.9

When the agent map's panel is narrower than 36 rem, the agents feature shall show the map stacked: its sides one under the other in the reading order, left, centre, below, right, at their natural size and with the same groups, headings, cards, add buttons and Tab order, what it can use two a row, with no lines and no fit, so nothing runs off the panel's right edge; when the panel is 36 rem or wider again, it shall fit the map as `agents.map.lines-and-fit` says.

## Examples

- Given a panel 390 pixels wide at 16-pixel text, then the map shows "What brings it work", the centre card "Mail triage", "What it can use" and "Who it hands work to" one under the other, with no lines, and the page doesn't scroll sideways.
- Given the stacked map, when the panel grows to 672 pixels, then 260 ms later the map is fitted again and its lines are drawn.
- Given 200 % text, then the map is stacked in a panel narrower than 1152 pixels.
