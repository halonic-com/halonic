# agents.map.phone-columns

- Status: draft
- Since: unreleased
- Source: HAL-13180 (PR 7); HAL-485 11.6 (`agents.phone.map-fits-width`); component specs 15.8; UX checklist 9.13

On the phone presentation, in a panel at least 22.5 rem wide, the agents feature shall lay the agent map out for the panel's width instead of shrinking it: three columns 22.5 rem wide in all, side cards 5.75 to 6.25 rem wide round a centre card 6.75 rem wide, with the same sides, lines and Tab order as on the desktop, every card and add button at least 48 pixels high, and the centre card's agent steps as rows at least 48 pixels high with a line between them; in a narrower panel, where the side cards can't be 92 pixels wide, it shall show the map stacked (`agents.map.stacked`).

## Examples

- Given a phone 360 pixels wide at 16-pixel text, then the map shows "What brings it work" on the left, "Mail triage" in the middle and "Who it hands work to" on the right, 360 pixels wide at its natural size, with its lines, and the page doesn't scroll sideways.
- Given the same phone, then "Agent Writer", "+ Add subagent" and the agent step "classify ›" are each at least 48 pixels high.
- Given a phone 352 pixels wide, or 360 pixels wide at 18-pixel text, then the map is stacked.
