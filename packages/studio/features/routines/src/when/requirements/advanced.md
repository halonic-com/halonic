# routines.when.advanced

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 8); HAL-13671 (C196 CL1); flow-routines 3.3, 3.4 and 3.5; microcopy 12.3

While a routine starts on a schedule, the When card shall have an Advanced section with the cron line, what it means in the engine's words, a helper line naming the five fields, and a time zone picker that lists the device's zone first and has "No time zone (uses the computer's)"; a cron line the engine accepts shall be written at once with the time zone kept, and one it refuses shall be left out of the file and shown with the engine's message once the field is left or typing pauses, read to a screen reader as "Schedule (cron): *message*" once when it appears, also while focus is still in the field, with "Still runs on the last valid schedule until the cron is fixed." while the routine is on; a zone the engine doesn't know shall show the engine's message under the picker; Advanced shall start open for a schedule the day chips can't show, which says "This schedule is more detailed than the day picker. Edit it as cron below."

## Examples

- Given `30 7 * * 1-5`, then Advanced shows the line and "Weekdays at 07:30".
- Given the cron field changes to `*/15 * * * *`, then that line is written and the time zone stays.
- Given the field holds `0 8 *` and it is left, then the message "Cron needs 5 fields (minute hour day month weekday), got 3." shows and nothing is written.
- Given the field holds `0 8 *` and typing pauses, then the shell's announcer reads "Schedule (cron): Cron needs 5 fields (minute hour day month weekday), got 3." once; when the field is then left, nothing more is read.
- Given the time zone picker changes to "No time zone (uses the computer's)", then the schedule is written without a `timeZone`.
