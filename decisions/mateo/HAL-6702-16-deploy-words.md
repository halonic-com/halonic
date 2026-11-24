# Decision: the account list's refusals use the deploy flow's words

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:r5mKbx5QgZuC9Bq4Z04thSuLEnD70wvb8ddr4ZXrQtqT9Xa5DhtikF5swxOWQOdbAtGZjOkEHL9xhFxvRedxBg==

## What changes

- `deploy.target-accounts`: an inactive token says that Cloudflare doesn't accept it any more and that nothing changed on Cloudflare. Its fix depends on where the token came from: "Make a new one and save it: halonic deploy login cloudflare" for a saved token, "Make a new one and put it in HALONIC_CLOUDFLARE_API_TOKEN." for the environment's. A token without the permission to list accounts names it as the dashboard shows it, "Account · Account Settings · Read", with exit 7 (`denied`) as before.

## Why

Words check C803 (HAL-17428): the old fix left `cloudflare` out of `halonic deploy login` and was wrong in CI, where `login` isn't the fix. The lines copy deploy flow 3.1 and 3.2, which the board approved on HAL-6814. No port change: the target already knows whether the token came from the environment.

## Tests

`accounts.test.ts`: the saved-token and environment-token forms of `token-inactive`, and `missing-permission`, each with its exact message and fix.

## Covers

- deploy.target-accounts
