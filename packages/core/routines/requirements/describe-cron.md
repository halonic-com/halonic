# routines.describe-cron

- Status: active
- Since: 0.1.0
- Source: `describeCron` in the old routines package (`packages/core/routines/src/describe.ts`) at 784f78d

When a cron expression is described, the routines package shall write it out in words: `Every n minutes` for `*/n * * * *`, `Hourly at :mm` for one minute in every hour of every day, and, for one minute and one hour in every month, `Daily at hh:mm`, `Weekdays at hh:mm` (Monday to Friday), `Weekends at hh:mm` (Saturday and Sunday), the named weekdays (`Mondays, Fridays at hh:mm`) or `Monthly on day d at hh:mm`; any other expression shall be returned as `Cron "<expression>"`, and a malformed one shall throw a `CronError`.

## Examples

- Given `0 8 * * 1-5`, when it is described, then the text is `Weekdays at 08:00`.
- Given `30 7 * * *`, when it is described, then the text is `Daily at 07:30`.
- Given `0 9 * * mon`, when it is described, then the text is `Mondays at 09:00`.
- Given `0 6 * * 0,6`, when it is described, then the text is `Weekends at 06:00`.
- Given `0 9 1 * *`, when it is described, then the text is `Monthly on day 1 at 09:00`.
- Given `*/10 * * * *`, when it is described, then the text is `Every 10 minutes`.
- Given `5 * * * *`, when it is described, then the text is `Hourly at :05`.
- Given `0 8 1-7 * 1` (both day fields restricted), when it is described, then the text is `Cron "0 8 1-7 * 1"`.
- Given `0 9 * * 7`, when it is described, then the text is `Sundays at 09:00` (7 is Sunday, not an eighth day).
- Given `0 9 * jan *` (not every month), when it is described, then the text is `Cron "0 9 * jan *"`.
- Given `0 8 * *`, when it is described, then a `CronError` is thrown.

## Not in this requirement

The old `describeTrigger` (manual, signal, mail and interval triggers, and the time zone suffix such as `(Europe/Amsterdam)`) needs the `RoutineTrigger` type from `format` and `parseEvery` from `schedule.ts`. It is ported with them under HAL-115.
