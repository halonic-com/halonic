# Decision: the deploy puts the workers.dev setting back after the self-test

- Approval: /HAL/issues/HAL-9254#comment-2a59be56-fbbb-4145-a2d7-6d8a77e38746 (Liam's re-review of #2653 at aef259a2; the fix was asked for in Liam's review of #2652, HAL-9253)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vIOnsys3t3Nrd5E6kIK/972Eb9L4pFnfDLR6pG6YaWMAdLWUzc3KcN2nY5G8MRL4K4pG+1A6FiCMlFh+4BM/AA==

## What changes

`deploy.orchestrate` now says that `deploy` reads the workers.dev setting before the self-test, turns it on
for the test and puts it back afterwards, also when the test fails. A Worker's first deploy leaves it on. A
close that fails stops the deploy before the switch, or says the new version is live when it already is, or
reports `workers-dev-left-open` after a failing test. Three examples are added. No example is removed.

## Why

Before, every deploy turned workers.dev on and left it on, so a Worker kept off it on purpose, for example
one served only from a custom domain behind Cloudflare Access, got a public address back for good. A first
deploy keeps it on because workers.dev is the new app's only address.

## Covers

- deploy.orchestrate
