# Decision: the Paperclip provider fills unknownSeatRuns and the failed read's time

- Task: HAL-17898
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17898 (Liam asked for this follow-up on HAL-17735; Liam approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Ag2582pltymauteOMjFtNLsYcMNweUOYID5r4dOwgsZei3pB1Jy/UiT3dohmlnyUoOZ3jYru06CeTdnuEo4jAA==

`paperclip-client.team-status-fields` changes, because the `halonic.seats` plugin now sends what the
provider couldn't fill before (#5800, requirement `paperclip.seats-summary-fields`):

- A seat's `failedRead.at` is the plugin's `failedReadAt`, when that read ran. A plugin from before
  #5800 doesn't send it, so the provider still falls back to the summary's own time.
- Spend gives `unknownSeatRuns`: spend reads `seats/summary?from=<range start>` and takes the
  plugin's count of runs with cost rows but no seat. It leaves the field out when the plugin answers
  404 or sends no count. The requirement used to say spend always leaves it out.

No test was weakened. The test that checked spend has no `unknownSeatRuns` now checks it for no
plugin and for a plugin without the count, and a new test checks the count and the `from` it was
asked for. The rate-limited seat's test expects the plugin's time, and the timed-out seat's test
keeps the summary's time as the older plugin's case. `paperclip-client.team-status`'s spend test
now also expects the seats read's `from`, and the request-list test counts 7 requests instead of 6.
No new row on `paperclipRequests`: spend uses the existing `seatsSummary` row with a `from` query.

## Covers

- paperclip-client.team-status-fields
