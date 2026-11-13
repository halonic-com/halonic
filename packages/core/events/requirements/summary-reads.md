# events.summary-reads

- Status: active
- Since: 0.1.0
- Source: HAL-62 receipt requirements RCPT-2.2 and RCPT-2.7; the `drafted` verb from HAL-8274 (HAL-1301)

The events package shall work out from a run's log what the run read and what it drafted, by the reader rules of `events.tool-result-risk`. `readsOf` counts the ok calls of a tool whose declared risk is `read` and that has a `noun`, one count per noun in the order of each noun's first call. `draftsOf` counts the ok calls of a tool whose risk is `write` and whose `verb` is `drafted`, the same way. Calls that failed, broke off, or lack a `noun` are not counted, and a send is never a draft.

## Examples

- Given ok read calls for an email, a Drive file and another email,
  when what the run read is worked out,
  then it is 2 emails and 1 Drive file.
- Given a read call that failed, a read call with `outcome: "unknown"`, and a read call without a `noun`,
  then nothing was read.
- Given an ok write call with the verb `drafted` and the noun email,
  when what the run drafted is worked out,
  then it is 1 email.
- Given an ok send call with the verb `drafted`,
  then nothing was drafted.
