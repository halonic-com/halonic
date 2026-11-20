# cli.duration

- Status: active
- Since: 0.1.0
- Source: the CLI output design on HAL-1981 (cli-output section 1.5, revision 19), approved by the board on HAL-2123; rounding and the shortest time decided by the team on HAL-2816; hours and days decided by the team on HAL-13919 (cli-output revision 53)

When the `halonic` command says how long something took, it shall write whole seconds under a minute ("18 s"), then minutes and seconds ("5 min 47 s"), or whole minutes when the seconds are 0 ("6 min"). From an hour on, it shall write hours and minutes ("2 h 15 min"), or whole hours when the minutes are 0 ("2 h"), and from 24 hours on days and hours, as Studio's Inbox counts days ("1 day 11 h", "2 days 4 h"). The time shall be rounded down to whole seconds, minutes or hours, and anything under a second shall read "1 s".

## Examples

- Given something that took 18.9 seconds,
  when its duration is written,
  then it reads "18 s".
- Given something that took 347 seconds,
  when its duration is written,
  then it reads "5 min 47 s".
- Given something that took 360 seconds,
  when its duration is written,
  then it reads "6 min".
- Given something that took 0.4 seconds,
  when its duration is written,
  then it reads "1 s".
- Given something that took 75 minutes,
  when its duration is written,
  then it reads "1 h 15 min".
- Given something that took 2 hours and 15 minutes,
  when its duration is written,
  then it reads "2 h 15 min".
- Given a run that waited for a person and took 2158 minutes and 32 seconds,
  when its duration is written,
  then it reads "1 day 11 h".
- Given something that took 52 hours,
  when its duration is written,
  then it reads "2 days 4 h".
