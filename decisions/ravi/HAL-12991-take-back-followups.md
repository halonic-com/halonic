# Decision: Take back also stops runs under a yes given again, and a stuck stop holds nothing up

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12991 (a technical follow-up to the Take back change in #3568; nothing in Studio calls `allow()` or `takeBack()` yet, so no user sees a change; a team decision, reviewed by Liam)
- Kind: internal

A run without the sandbox now registers with the whole yes it started under, its reason and its
`allowedAt`. The check of the saved yes stops it when the saved yes has another reason or another
`allowedAt`, so a yes taken back and given again before the next check still stops the runs started
under the old one. The start gate compares `allowedAt` the same way after a start, stops what it
started on a mismatch and returns `needs-yes`.

The check of the saved yes schedules its next round without waiting for the stops. A run stays
registered until its stop returns and is never stopped twice at once, so one stop that never returns
doesn't hold up the checks for the other runs. Take back gives each stop ten seconds
(`stopTimeLimitMs`) and reports the ones that didn't stop in that time, so it always returns.

## Covers

- app.unfenced-runs
- app.runner-start-gate
