# Decision: a choice on hold says when the agent's file changed

- Approval: /HAL/issues/HAL-4295 (checklist 3.8: the warning's first line names the day the file changed)
- Kind: internal

The confirm-again warning starts with "*Writer*'s file changed on 9 Nov at 14:02". Nothing kept that time, so two active requirements gain one sentence and one example each.

- `app.agent-placement`: a `file-changed` answer also gives the time the earlier choice was made. Nothing else in the answer changes, and the agent still runs in its sandbox.
- `studio.agent-placement-choices`: a choice on hold also says when the file changed. That is the time of the newest version that changed the file after the choice, and only when the saved file is that version. An edit saved since that version, a file put back as it was before the choice, or versions that can't be read give no time, so the warning just says the file changed. Nothing the requirement already said changes, and it is still unreleased.

Neither change lets an agent out of its sandbox: the time is only shown, and confirming still saves for the fingerprint the person was shown.

## Covers

- app.agent-placement
- studio.agent-placement-choices
