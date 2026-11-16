# Decision: a phone says the client ID and secret are kept after a refused sign-in

- Task: HAL-10596
- Approval: Liam approves this note in review on the review task of HAL-10596 (HAL-10687); the sentence is a small wording decision on an approved screen, made by the team under the HAL-2282 rule with no board card
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5mze+GKFs1TnvuxfBvK2FHTlFnOnO+9dDmPhc1q9c6mXrLZSO1ApcwomSCWwVpK8WqoKFJTk/m05pxd5jEKNBQ==

## What changes

On a phone, when Google has refused a sign-in, the banner already says "Fix this on your computer:
Library › Connectors". It now also says "Your client ID and secret are kept. Only the sign-in is
needed." A refused client secret or an unknown client does not say it, because for those the secret
or the client is what has to be replaced. It does not show under the Testing hint either ("Publish
it, then sign in again."), because there the user must publish the app first, so "only the sign-in
is needed" would be wrong.

The requirement `google-setup.connector-problem` quotes the new sentence and gains an example for a
phone with a refused client secret. The test of the requirement checks both cases. No test was
weakened or skipped.

## Why

A user who sees the refusal on a phone could think the whole setup was lost and be afraid to fix it
on the computer. Only the sign-in has to be done again (HAL-10596).

## Covers

- google-setup.connector-problem
