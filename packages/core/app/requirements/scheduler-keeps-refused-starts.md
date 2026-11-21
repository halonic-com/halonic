# app.scheduler-keeps-refused-starts

- Status: draft
- Since: unreleased
- Source: design check C533 (C533-5, HAL-15056) of halonic#4172; flow-routines rev 23, 3.9 (the eighth reason); task HAL-15068

When the routine scheduler asks for a due run and the start is refused (the host's checks or the executor throw, or what to start can't be worked out), the routine scheduler shall still report the time as failed, and shall add it to the routine's skip records (`app.skip-records`) with the reason `start-refused` after the tick's starts, with the error's message as its `sentence` when the error has a kind other than `internal`, and no `sentence` otherwise. Refused times with the same sentence shall continue one row until a run of the routine starts; times with a different sentence, or one with a sentence and one without, shall make different rows.

## Examples

- Given an hourly routine whose start is refused with "The input has no field mail, which the step Read the email reads." at 08:00 and 09:00,
  when the 09:00 tick runs,
  then the routine has one `start-refused` row with that sentence, 08:00 to 09:00, 2 times.
- Given that routine's 10:00 run starts and its 11:00 start is refused again,
  then the 11:00 time is a row of its own.
- Given starts refused with a system error ("EIO: i/o error, read"), then with an `internal` error,
  then the routine has one `start-refused` row without a sentence, 2 times.
