# server.claim-fields

- Status: active
- Since: unreleased
- Source: HAL-13213; review of the principal check (PR #5304)

When the server reads a session's claims or a stored principal record, it shall read each field once, and only from the object's own data fields, so an inherited field or one behind a getter counts as missing.

Rationale: a field that gives one value to the check and another to the principal could turn a member of an organisation into its owner.

## Examples

- Given claims whose `role` is a getter that says `member` once and `owner` after that, then the claims are refused.
- Given a principal record whose `v` comes from its prototype, then the record is refused.
