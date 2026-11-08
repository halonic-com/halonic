# routines.mail-check

- Status: active
- Since: 0.1.0
- Source: `mailCheckDue` and `mailQuery` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When a mail trigger has never been checked, or a full `every` has passed since the last check, the routines package shall say a check is due. The query for a check shall be the trigger's query plus `after:` the last check minus ten minutes, in whole seconds, so a message that arrived during the last check is not missed.

## Examples

- Given `every: 15m` and a last check at 10:00, when it is 10:14:59, then no check is due; at 10:15:00 one is.
- Given a last check at 10:00:00.9, when the query is made, then it ends in `after:` and the seconds of 09:50:00.
