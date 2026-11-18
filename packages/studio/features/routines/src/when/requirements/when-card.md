# routines.when.when-card

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 6); flow-routines 3.3 and 3.4; microcopy 12.3

The routine page shall show a When card with the trigger in words, an On/Off switch named "Runs on its own" that writes `enabled` at once and announces "<name> is off. It only runs with Run now." or "<name> is on. Next: <time>.", and, while the routine is on, live and has a clock, the next three start times in the routine's time zone (with the zone named when it isn't the device's); a manual routine says "Starts only with Run now." and shows no times; a change that can't be saved shows why in the card and leaves the switch as saved; a routine that has never been live can't be turned on and says to make it live first; and, while the saved trigger differs from the live version's, the line "Your new schedule isn't live yet. Until it is, the routine keeps the live one: <the live trigger>." (for a trigger that isn't a schedule, "Your new trigger …").

## Examples

- Given a routine that runs on weekdays at 07:30, then the card reads "Weekdays at 07:30" with "Next Fri 6 Nov 07:30 · Mon 9 Nov 07:30 · Tue 10 Nov 07:30".
- Given the switch is turned off, then the host saves `enabled: false` and a screen reader hears "Daily is off. It only runs with Run now."
- Given the routine is off, then no times show.
- Given the routine has the time zone Europe/Amsterdam and the device has another, then each time ends with "(Europe/Amsterdam)".
- Given an `every` routine that has never run, then Next reads "At the next check (it hasn't run yet)".
- Given the save fails, then the card shows "Couldn't save the change." and the reason, and the switch shows what is saved.
- Given a routine that has never been live and is off, then the switch can't be turned on and "Make this routine live first to turn it on." shows.
- Given the saved schedule differs from the live one, then "Your new schedule isn't live yet. Until it is, the routine keeps the live one: Weekdays at 07:30." shows.
- Given the saved trigger is the live one, then no such line shows.
