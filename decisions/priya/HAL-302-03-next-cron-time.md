# Decision: `routines.parse-cron` records a wildcard hour

- Requirement: `routines.parse-cron` (`packages/core/routines/requirements/parse-cron.md`)
- Task: HAL-302, with the daylight saving rules decided in the review task HAL-431
- Approval: Mateo (package owner) and the maintainer decided the rules in HAL-431; the maintainer approves this change in review

## What changes

The requirement grows; nothing it promised before is taken away. The parser also records whether
the hour field is `*` or `*/n` (`Cron.hoursWildcard`). `nextCronTime` needs it: as in classic cron,
a job with a wildcard hour runs through both copies of a repeated autumn hour, while a job at set
hours fires once and makes up a time the clocks skip in spring
(`routines.next-cron-time-dst`).

## Why

Whether a job runs "every hour" or "at set hours" can't be read back from the hour set alone
(`*` and `0-23` give the same set), so the parser has to record how the field was written.

No test was weakened; the new flag has its own test in `src/parse-cron.test.ts`.
