# Decision: a many-user server with Cloud sign-in answers the account menu

- Task: HAL-18215
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14151 (S2-25 plan, PR 3, approved by Liam on 25 Nov)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OA9y95A7s5bXdvdByUaSSzBq1i/Um7CzX/XVToC1t6OAnwTI0MNPNV3inE606WeqqyRXW7q+Hx4T7Q1AHNEaAw==

## What changes

`server.end-user-routes` lists the routes a many-user server answers. It gains
`GET /api/account-menu`, behind a session, which the served Studio's account menu
(`studio.served-account-menu`, already on `main`) reads. The new `server.account-menu` says what
it answers and that it answers 404 on a single-user server, without Cloud sign-in and for a session
without Cloud's profile. The new `server.cloud-session-profile` says how the verifier and the shared
claim checks read the `name`, `account` and `product_name` claims Cloud signs since cloud#178.

The allow-list test in `packages/host/server/src/end-user-routes.test.ts` gains the one row; no
row is removed and no test is weakened, skipped or deleted.

## Why

The plan approved on HAL-14151 puts the customer's name, plan and account page in the served
Studio's account menu, read from Cloud's signed session and the deployment's usage. The route
shows end users only their own facts, nothing about how the project is set up, so it fits the
allow list's rationale.

## Covers

- server.end-user-routes
