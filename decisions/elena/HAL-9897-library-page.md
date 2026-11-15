# Decision: keep the Library list on a failed re-read and hide raw errors

- Task: HAL-9897
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9890 (Sofia's design check on HAL-9890; a team decision with no board card, HAL-2282 rule)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wS5Cp01bQx1plhyvALauvzrRxeBvmcBfL1iNYkG0TXJwzmhOXbzEvRx4lxMg7sNHvJcBvlnbbGH7rUGhtISiCQ==

## What changes

A later failed read keeps the last list and adds "Couldn't load" with Try again above it. Only a
kinded error shows its reason; any other error shows none. Try again shows "Trying again…". The
old list stays only when the host and the tab both match, so another workspace's rows never show.
An empty tab has no search field and keeps one button in the empty state.

The requirement `library.library-page` gains these cases. No test was weakened or skipped.

## Why

A failed re-read replaced the list with an error, and a system message could reach the user
(HAL-9890).

## Covers

- library.library-page
