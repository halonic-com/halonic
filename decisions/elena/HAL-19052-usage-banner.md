# Decision: the account menu answer carries the units nearly used up

- Task: HAL-19052
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14163 (S3-11 plan, PR 3, approved by Liam on 26 Nov)
- Kind: user-visible

## What changes

`server.account-menu` lists the exact fields of `GET /api/account-menu`'s answer. It gains
`warnings`, which the new `server.account-menu-warnings` defines: the units at 80% or more of their
limit and under 100%, each as `unit`, `percent` and `resetsAt`, highest first. The answer keeps
every field it had, with the same values.

`studio.served-account-menu` lists the exact fields the served Studio accepts from that answer. It
gains `warnings` too, and an answer whose warning isn't exactly `unit`, `percent` and a `resetsAt`
time is refused like any other wrong answer.

The tests that pin the whole answer (`packages/host/server/src/account-menu-route.test.ts`,
`apps/studio/src/account/served-account-menu.test.ts`) gain `warnings: []` in their expected
answer. No test is weakened, skipped or deleted: the app's test gains three more refused answers.

## Why

The plan approved on HAL-14163 shows flow C3's 80% banner in the served Studio
(`account-menu.usage-banner`) from the existing account menu answer, so no new end-user route is
added to the allow list (`server.end-user-routes`) and nothing asks Cloud.

## Covers

- server.account-menu
- studio.served-account-menu
