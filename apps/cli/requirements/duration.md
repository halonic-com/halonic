# cli.duration

- Status: active
- Since: 0.1.0
- Source: the CLI output design on HAL-1981 (cli-output section 1.5, revision 19), approved by the board on HAL-2123; rounding and the shortest time decided by the team on HAL-2816

When the `halonic` command says how long something took, it shall write whole seconds under a minute ("18 s"), then minutes and seconds ("5 min 47 s"), or whole minutes when the seconds are 0 ("6 min"). The time shall be rounded down to whole seconds, anything under a second shall read "1 s", and there shall be no unit larger than minutes.

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
  then it reads "75 min".
