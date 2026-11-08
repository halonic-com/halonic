# routines.parse-cron

- Status: active
- Since: 0.1.0
- Source: `parseCron` in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

When a five-field cron expression (minute hour day-of-month month day-of-week) or a macro is parsed, the parser shall return the set of allowed values for each field, accepting `*`, single values, ranges, steps, comma lists, three-letter month and weekday names in any case, 7 as a second name for Sunday, and the macros `@hourly`, `@daily`, `@midnight`, `@weekly`, `@monthly`, `@yearly` and `@annually`, and shall record whether day-of-month and day-of-week are both restricted.

## Examples

- Given `*/15 8-18/2 * jan,dec mon-fri`, when it is parsed, then the minutes are 0, 15, 30 and 45, the hours 8, 10, 12, 14, 16 and 18, the months 1 and 12, and the weekdays 1 to 5.
- Given `0 0 * * 7`, when it is parsed, then the weekdays are 0 and 7.
- Given `@daily`, when it is parsed, then the hours are 0 and the minutes 0.
- Given `@WEEKLY` with spaces around it, when it is parsed, then it is the same as `0 0 * * 0`.
- Given `5/20 * * * *`, when it is parsed, then the minutes are 5, 25 and 45 (a single value with a step runs to the end of the field).
- Given `0 9 1 * mon`, when it is parsed, then day-of-month and day-of-week are both restricted, so a day matching either one counts.
- Given `0 9 * * mon`, when it is parsed, then only day-of-week restricts the day.
- Given `0 9 1 JAN SUN`, when it is parsed, then the month is 1 and the weekday 0.
