# retry-detectors.weekly-metrics

- Status: active
- Since: unreleased
- Source: HAL-18785, step 4 of HAL-17073 ("pass/rework counts per week")

The retry detectors package shall count, from a decision log, per week starting Monday (UTC): the tasks with a ship choice, those that shipped an attempt and those that fell back to Opus, the shipped ones that passed, needed rework or have no outcome yet, the mean attempts and wait per task and the week's spend. A task shall count in the week of its ship choice, and its latest outcome shall win.

## Examples

- Given two tasks shipped on Tuesday 24 Nov 2026, one passed and one reworked, and one fallback on Sunday 29 Nov,
  then the week of 23 Nov has 3 tasks, 2 shipped, 1 fallback, 1 pass and 1 rework.
- Given a task shipped on Sunday 29 Nov whose outcome came on Monday 30 Nov,
  then it counts in the week of 23 Nov.
