# Decision: a cached model answer is not a call without a price

- Task: HAL-8357
- Approval: Liam approves this note in review on HAL-8357
- Kind: internal

## What changes

`summarize` skips an `llm.response` with `cached: true`: it adds no cost, no tokens and no unpriced call. The requirement `events.summary-cost` states the rule and gets one example, and `summarize.test.ts` covers it.

## Why

A cached answer ran no model, so it has no price to miss. Counted as unpriced, the run row and the receipt total said "1 call without a price" while the receipt model line said "cached, no model call". Nothing emits `cached: true` yet, so no shown number changes today.

No test was weakened or skipped.

## Covers

- events.summary-cost
