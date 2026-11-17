# routines.when.trigger-fields

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 7); flow-routines 3.3, 3.4 and 3.5; microcopy 12.3

The When card shall let a person pick what starts the routine (Manual only, On a schedule, Every …) and write it at once: picking the kind it already has writes nothing, and picking another writes that kind's default; for a schedule the card shall show seven day chips (Mo to Su) and a time field that write the shortest cron line and keep the time zone, and shall keep the last day on with the hint "Pick at least one day." until another day is on; a schedule more detailed than the chips shall show no chips and say so; for Every … the card shall show a count of one or more and a unit (minutes, hours, days) that write `<count><m|h|d>`, and shall leave the fields empty for an interval the form can't show.

## Examples

- Given Manual only, then the picker offers On a schedule, which writes `0 8 * * 1-5` with the device's time zone.
- Given weekdays at 07:30 and Sa is pressed, then `30 7 * * 1-6` is written with the time zone kept.
- Given only Mo is on and Mo is pressed, then nothing is written and "Pick at least one day." shows until Tu is pressed.
- Given the time field changes to 18:00 with all days on, then `0 18 * * *` is written.
- Given `*/15 * * * *`, then no chips show and the card says "This schedule is more detailed than the day picker."
- Given Every 1 hours and the count changes to 2, then `2h` is written; given `1.5h`, the count and unit are empty.
