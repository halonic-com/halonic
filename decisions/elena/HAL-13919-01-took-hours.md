# Decision: a long run's time reads in hours and days

- Task: HAL-13919
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13919 (hours and days decided by the team under HAL-2282 in the task's description; Liam's review on the task set days from 24 hours, as the Inbox counts them; cli-output 1.5 revision 53 on HAL-1981)
- Kind: user-visible

## What changes

`cli.duration`: under an hour stays as it was ("18 s", "5 min 47 s", "6 min"). From an hour on,
the `halonic` command writes hours and minutes ("2 h 15 min"), or whole hours ("2 h"). From 24
hours on it writes days and hours ("1 day 11 h", "2 days 4 h"), with a singular "1 day". The
clause "there shall be no unit larger than minutes" is dropped. The example of something that
took 75 minutes now reads "1 h 15 min", and examples for "2 h 15 min", a run of 2158 min 32 s
("1 day 11 h") and 52 hours ("2 days 4 h") are added.

`runs.row-columns`: how long a run took, under its start time in Studio's Runs list, follows the
same rule, so `halonic runs` and Studio still agree. An example for a run that took over a day is
added.

Nothing else in either requirement changes, and no example is removed.

## Why

Since the window can answer runs (#3913), a run answered from the Inbox a day later read
"took 2158 min 32 s" in the Runs list, next to the Inbox's "Waiting 1 day" for the same run
(C267 DU1). Days start at 24 hours so both places count days the same way.

## Covers

- cli.duration
- runs.row-columns
