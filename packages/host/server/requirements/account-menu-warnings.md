# server.account-menu-warnings

- Status: active
- Since: unreleased
- Source: HAL-19052 (S3-11 PR 3), plan approved by Liam on HAL-14163; flow C3's 80% row (`limit.warning`)

The `warnings` of `GET /api/account-menu`'s answer (`server.account-menu`) shall list each unit
the deployment's account usage gives for the principal that is at 80% or more of its limit and
under 100%, as exactly `unit`, `percent` and `resetsAt`, the highest percent first. It shall be
empty when no unit is in that range, or when the account usage gives no units or there is none.
A used-up unit shall not be listed: the runs it stops say so themselves.

Rationale: the served Studio shows a quiet banner once per unit and period when a unit is nearly
used up (`account-menu.usage-banner`), without a new route an end user could reach and without
asking Cloud.

## Examples

- Given agent time at 82%, tokens at 95%, runs at 79% and cost at 100%, all resetting on
  2 December, then `warnings` is tokens at 95, then agent time (`harnessMs`) at 82.
- Given an account usage without units, then `warnings` is empty.
