# Decision: a failed seats read leaves unknownSeatRuns out instead of failing spend

- Task: HAL-18040 (follow-up from the review of #5842, HAL-17898)
- Approval: Liam asked for this change in his review of #5842 on HAL-17898; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VznaFM+R7k+ycONM53OJc/pu+mfvHgAb9Dtwm7ZqMmnnXSLjOuTAuzs9nu6wRP+ZgknhgQsDd+tKXV/3htADBA==

## What changes

- `paperclip-client.team-status-fields`: spend leaves `unknownSeatRuns` out when the seats
  plugin's read fails for any reason, not only on a 404, and still gives the paid money and
  tokens. Before, a 5xx or a 400 from the plugin's `from` check threw and failed the whole spend
  read. Only a 404 marks the seats part as not served. The spend read inside `refresh` no longer
  asks the plugin for the count, so the plugin doesn't scan today's cost rows every 5 minutes.
  Two examples are added; no example or test is weakened.

## Why

`unknownSeatRuns` is an optional count the port lets a source leave out. A fault in the plugin
that counts it shouldn't hide the money and tokens Paperclip's own cost routes answered.

## Covers

- paperclip-client.team-status-fields
