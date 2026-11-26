# paperclip.wake-hold

- Status: active
- Since: unreleased
- Source: HAL-19315 (plugin half of HAL-19292, front bot v2b); design in HAL-19223's `wake-hold-draft`

While the setting `wakeHoldEnabled` is `true`, the Agent tools plugin shall answer the data key `wake-hold`, asked with `{ companyId, issueId, owedCount, oldestOwedAt, newestOwedAt }`, with `{ wake: "after", seconds }`, where `seconds` is the setting `wakeHoldSeconds` (a whole number from 1 to 10, 3 by default or when it is anything else) minus the seconds since `newestOwedAt`, rounded up and at least 1; it shall answer `{ wake: "now", reason }` when that is 0 or less, when the setting is off, when the task isn't a chat task of that company, when a run on the task is live, or when a parameter is missing. It never calls a model or the network to answer.

## Examples

- Given the setting on with 3 seconds, a chat task with no live run and a newest owed message 1.2 s ago, when the server asks, then the answer is `{ wake: "after", seconds: 2 }`.
- Given the same task and a newest owed message 3 s ago, then the answer is `{ wake: "now", reason: "the hold has passed" }`.
- Given a run live on the task, then the answer is `{ wake: "now", reason: "a run on the task is live" }`.
- Given the setting off, then the answer is `{ wake: "now", reason: "setting wakeHoldEnabled is off" }`.
