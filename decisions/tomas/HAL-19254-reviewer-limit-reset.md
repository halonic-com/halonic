# Decision: a usage-limit stop ends at the provider's recorded reset time

- Approval: the task asks for this change (https://paperclip.halonic.com/HAL/issues/HAL-19254, Liam's follow-up from #6376); Liam signs this note in review
- Kind: internal

Liam's review of #6376 (HAL-19203) asked for this follow-up. A reviewer whose
newest run stopped on a seat or usage limit counted as limited for 5 hours
unless a run of theirs started again. Once their reviews have moved to the
other reviewer, nothing may start such a run, so they stayed "limited" after
the provider's window had reset. Now, when the stop's message names a reset
time, the reviewer counts as limited only until then; with no reset time the
5-hour window stays as the fallback. The requirement's sentence on when a
reviewer is limited changes to say so, and it gains an example.

## Covers

- paperclip.pr-watcher-reroute
