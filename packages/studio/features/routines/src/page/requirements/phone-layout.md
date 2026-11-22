# routines.page.phone-layout

- Status: draft
- Since: unreleased
- Source: HAL-15338; Routines UX check RT10 to RT12 (HAL-15304); flow-routines 5.2 and 5.3; PLR 2.1 and 2.2; checklist 4.8; WCAG 2.5.8; HAL-15813 (C633 row 51: Manual only stands alone)

When the presentation is `phone`, the routine page shall show **Run now** as one full-width secondary button in a bar at the bottom of the page, on the Schedule and Runs views alike, and not in its header; the When card shall show each next start time on a line of its own; the When card's header row shall be at least 48px high and all of it shall be the On/Off switch's target; each option in the Trigger picker sheet shall show the sentence it would write in core's words, the routine's own sentence under the kind it is on and the sentence of that kind's default under every other, and no second line when the sentence reads the same as the option, as for **Manual only**; and a 48px row "Open <name>" in `accent-text` under the Workflow or agent picker shall open what the routine starts, where the window can open it. At any width, the day chips shall show Mo to Fr on one row and Sa and Su on the next, in one Days group.

## Examples

- Given "Daily" on a phone, then **Run now** is in the bar at the bottom and not in the header, and it is still there on the Runs view; pressing it starts the run.
- Given "Daily" on a phone with three next start times, then Next shows them on three lines.
- Given "Daily" on a phone, then the When header row is the switch's target, at least 48px high.
- Given "Daily", on Weekdays at 07:30, on a phone, when the Trigger picker sheet opens, then On a schedule shows "Weekdays at 07:30", Manual only shows no second line and Every … shows "Every hour (UTC)".
- Given "Daily", which starts the workflow Briefing, on a phone, then the row "Open Briefing" opens Briefing; on desktop there is no such row.
- Given a routine on a schedule, at any width, then the Days group has the row Mo Tu We Th Fr and the row Sa Su.
