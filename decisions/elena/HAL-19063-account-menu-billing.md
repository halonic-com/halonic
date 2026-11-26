# Decision: the account menu answers Cloud's billing state and the addresses for it

- Task: HAL-19063
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14182 (S4-16 plan, PR 2, approved by Liam on 26 Nov)
- Kind: user-visible

## What changes

`server.cloud-session-profile` gains the optional `billing` (`payment_failed`, `trial_ends`,
`no_plan`) and `billing_until` (`YYYY-MM-DD`, a day that exists) claims. Unlike the profile's
other claims, a wrong pair, or only one of the two, is dropped and never refuses the session, so a
newer Cloud never locks a customer out of an older app. The requirement says so and why, so
nobody later makes it refuse to match the other claims.

`server.account-menu` gains `billing` (`{ state, until }` or `null`) and three addresses built on
the server from the `account` claim alone: `plansUrl` (`<account>/plans?from=app`), `billingUrl`
(`<account>#billing`) and `exportUrl` (`<account>/export`). It is the same route, so
`server.end-user-routes` doesn't change.

`studio.served-account-menu` reads the answer with a strict schema, so it accepts the four new
fields and checks the three new addresses like the two it had; without that the served menu would
reject the server's new answer. Nothing in the Studio shows them yet: the banners are PR 3.

No requirement is retired, and no test is weakened, skipped or deleted: the existing tests'
expected answers gain the new fields, and new tests cover the pair and the addresses.

## Why

The plan approved on HAL-14182 puts payment failed, trial ending and no plan banners in the app,
read from Cloud's signed session instead of a new call to Cloud, with links only to addresses
built from the `account` claim (design 12.4).

## Covers

- server.cloud-session-profile
- server.account-menu
- studio.served-account-menu
