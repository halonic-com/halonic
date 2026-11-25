# Decision: a personal Google app in Testing gets an end date, a reminder a day early and a "weekly sign-in ended" message

- Task: HAL-18664
- Approval: the board chose option 1 on HAL-18554 (25 Nov): personal apps stay in *Testing*, with the flow in google-setup-flow revision 12 (HAL-621). Liam approves this build of it on HAL-18664 and signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:b02NB0psvPNdpIiUgd8f7QsRfXyH53/jQB/pRpp8DeIZcq/7memsZeRuDs4gUW7V6PQMEZDC3fUBnTgxQkguDQ==

## What changes

For a personal Google account whose setup record says its app is in *Testing*:

- Step 7 shows "Google ends this sign-in on 15 Nov at 10:42." after a sign-in, and the finished
  line adds "Studio reminds you on 14 Nov to sign in again." (design 3.5, items 3 and 4).
- From a day before the end, worked out from the record with no call to Google, the connector has
  the new state **Sign-in ends soon**, and the setup item comes back to the Inbox as "Sign in
  again for x@example.com", opened at step 7. **Not now** keeps it out of the Inbox for that
  sign-in, through the new record field `reminderClosedAt` and the edit `reminder-closed`, which
  the host's PATCH route accepts (design 5.2 row 2).
- A refused refresh 6½ to 7½ days after the last sign-in says "Your weekly sign-in ended. …" with
  "Why not publish?" folded under it, and opens at step 7 only. It replaces the old Testing hint,
  which opened at step 3 and asked the user to publish (design 5.2 row 3).
- The generic refused sign-in sentence takes revision 12's words: "Google no longer accepts
  Halonic's sign-in for x@example.com. … Nothing ran." Its Testing clause still goes for an app
  *In production* (UX checklists 8.4).

Workspace accounts and personal apps *In production* see none of this.

## Why

Google won't publish an app without a home page and a privacy policy (revision 8), so the board
chose to keep personal apps in *Testing* and make the weekly sign-in expected instead of a
surprise on day 8 (HAL-18554).

## Covers

- google-setup.connector-state
- server.google-setup-write
- google-setup.connector-badges
- google-setup.connector-facts
- google-setup.connector-problem
- library.connection-state
