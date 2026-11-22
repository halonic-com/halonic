# Decision: the run page says how a rejected run ended

- Task: HAL-14592
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14586#document-notes (run page notes for a run that ended on a rejection; small details of an approved screen, team decision under the HAL-2282 rule, no board card; built on HAL-14592)
- Kind: user-visible

## What changes

- The receipt's summary line says "sent nothing" for a run that made no tool call, with the CLI's rule
  (`apps/cli/src/messages/sends.ts`): "Finished in 8 s · sent nothing · asked you once". A live run says
  "sent nothing so far". A run whose tool calls sent nothing still has no sent part.
- A completed run of a workflow with more than one final state gets an "Ending: {final state's title}" line
  under the summary line (new requirement `runs.run-view.receipt-ending`). A workflow with one ending keeps
  "Finished" alone (HAL-11699).
- The dashed frame of the agent's words reads "What you rejected (the agent's own words, not used)", or
  "What a rule rejected …", when the last agent answer came before a rejection and no agent answered after it.
- In Every step, a step with an answer of reject (a wait step's or a tool approval's) has the grey stopped
  mark and is read "rejected", not the green check. A failed step keeps its red mark.
- The finished announcement says "Ending: …." before what the run sent, and now says "Sent nothing." too,
  as the receipt's summary line does.

The requirements change their wording and examples to match. Expectations that said a run without a tool call
has no sent part now expect "sent nothing". The agent-says tests moved from `receipt-model.test.ts` to the
new `agent-says.test.ts` unchanged, so the first stays under the file-size headroom; no test was weakened or
skipped.

## Why

After **Reject** in the Acme sample the page said Done, showed a green check on "Approve this reply?" and the
rejected draft under "What the agent says it did", which together read as "the reply went out" (HAL-14586).

## Covers

- runs.every-step
- runs.run-view.agent-says
- runs.run-view.receipt-summary
- runs.run-view.status-announcements
- packages/studio/features/runs/src/run-view/receipt-model.test.ts
