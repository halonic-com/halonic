# Decision: a token that lives under two minutes is used for half its life

- Approval: Liam asked for this follow-up on HAL-8533 after the review of #2470 (HAL-8530); Liam approves this note in review
- Kind: internal
- Task: HAL-8533

## What changes

`oauth-sign-in.sign-in-tokens` gets one clause: the access token must be valid for at least 60 more
seconds, or for at least half its life when it lives under two minutes. A new example says a token that lives 40
seconds is used for 20 seconds and refreshed after that. Nothing else in the requirement changes,
and no example was removed or weakened. Tokens of two minutes or more behave as before.

## Why

A token that lives under 60 seconds was never usable, so every `access` ran a refresh, and each
refresh also rotated the refresh token. Half its life is the simplest rule that keeps the token
usable for a while and still leaves time for the request that uses it.

## Covers

- oauth-sign-in.sign-in-tokens
- packages/core/oauth-sign-in/src/sign-in-tokens.test.ts
