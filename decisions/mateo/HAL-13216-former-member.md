# Decision: a scope's delete says how many runs it erased, and names one more known limit

- Approval: HAL-13216, follow-ups from the reviews of the scope delete (HAL-17284, HAL-17285)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Qk6nHIaaFnLf0xPSeS3Oi/dkhmb4PmS2qq2EE4QrNBPjGujYr59KZvJIEjIFXS385Ov3OgwscXlfP+unAsqjDw==

The scope delete (`runtime.delete-scope`) landed answering 204 with no body,
and its known limits named only a run that hadn't reached the run list yet.
The reviews asked for two changes.

Requirement edited, none weakened:

- `runtime.delete-scope` now answers 200 `{"deleted":{"runs":n}}` instead of
  204, so the operator sees how many runs the scope's run list named and
  whose objects were erased. The refusals (400 `bad_scope`, 503) don't
  change, and neither does what is erased.
- Its `Known limits` line adds a run's alarm that is already running during
  the erase: its loops, or a timer call already in the engine, can still
  write to that run's object. Running the delete again, as the operator
  procedure already says, erases that too. The same must-fix is on HAL-13217
  for a user-facing delete.

The README's row for the route now gives the new answer and suggests
`POST /admin/sessions/revoke` first when nobody may write to the scope
between the two runs.

## Covers

- runtime.delete-scope
