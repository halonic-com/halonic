# Decision: the DeployTarget port goes to version 2 with `accounts()`

- Approval: Liam's comment of 23 Nov 23:11 UTC on HAL-17139 approves `accounts()` on `DeployTarget` as port version 2; Liam approves this note in review
- Kind: internal

## What changes

- `DeployTarget` gets `accounts()`, which lists the accounts the token reaches, and `deployTargetVersion` goes from 1 to 2. Requirement `ports.deploy-target` now says version 2 and lists `accounts` among the methods. Nothing else in it changes.
- Requirement `contracts.fake-deploy-target` adds what the fake does for `accounts`: it lists the accounts it was given (by default only the one its plans and status show), and a test can make the next call reject with `token-missing`, `token-inactive` or `missing-permission`.
- New requirements, `Since: unreleased`: `contracts.deploy-target-accounts` (every target's `accounts` lists what its `login` listed and changes nothing) and `deploy.target-accounts` (the Cloudflare target's `accounts`).

## Why

`deployments.yaml` now keeps the Cloudflare account id (HAL-17139, #5543). `halonic deploy` has to check that id, or pick the only account, before it plans, in CI and on a computer that never ran `login`. Only `login` listed accounts so far. A new method breaks a target built for version 1, so the version goes up, and the loader refuses a version 1 target with its existing message. The why is also in the amendment to `docs/adr/2026-11-07-port-list-and-versions.md` and in ADR HAL-35 5.6.

## Tests

The contract suite gets one test for `accounts` and runs it against the fake. The fake's own tests cover several accounts and each failure. The Cloudflare target has 5 tests for `accounts`: the list, the token order, no token, and a refused list (inactive token, missing permission, a token that can't be verified, an account token). The loader's tests now expect version 2 and `accounts` among the methods.

## Covers

- ports.deploy-target
- contracts.fake-deploy-target
