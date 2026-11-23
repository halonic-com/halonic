# contracts.deploy-target-accounts

- Status: active
- Since: unreleased
- Source: task HAL-17143; `accounts()` on the `DeployTarget` port, version 2, approved by Liam on HAL-17139

Where a target implements `DeployTarget`, its `accounts` shall list the same accounts its `login` listed for the token it saved, and change nothing on the host.

Rationale: `halonic deploy` picks or checks the account with `accounts` before it plans, so every target must answer it the way `login` did.

## Examples

- Given a target that saved a token with `login`,
  when `accounts` is called,
  then it lists the accounts `login` listed, and nothing is deployed.
