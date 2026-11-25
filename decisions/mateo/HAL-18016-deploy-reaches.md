# Decision: the deploy app service plans, and reads what a deployment reaches

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:0xfQ9Q9i9oN0yu+6Ko7mHbcT07HSX1L76wJeTmfMcE0gG0in9eqTBiEVomZx1ReRZuycZho1JzF+ujkpQpOLDQ==

## What changes

- `app.deploy-service`: the service gets `plan`, for `halonic deploy <deployment> --plan` (deploy flow 2.11). It gives the target's plan and what of it is new against what's live. It doesn't deploy, take the lock or ask anything, and a held lock is in the plan, not an error. It also gets `deploymentRef`, so the command makes the request's deployment through the same account check `status` uses.
- `app.deploy-service`: the lock and missing-answers refusals no longer start with "Couldn't deploy web:". The command line already puts that before every error of `halonic deploy`, so it showed twice.
- New `app.deploy-reaches`: what a deployment on Cloudflare would reach, read from the workspace's providers, connectors and agents, as the summary's "Reaches" row (2.7). The list is complete or there is none: anything that can't be placed on an internet address is listed with its file and a reason, as the 3.6 lines show it.

## Why

HAL-18016: `halonic deploy <deployment>` and `--plan` need the plan and the reaches before the command can show the summary. C1 (board, HAL-6814) lets an untrusted workspace deploy only if "Reaches" is complete or the deploy stops (Julian's condition 2, HAL-6716), and pairs a secret with an address only if only that address gets it (condition 4). The engine hands a provider's or connector's secret only to the provider or connector that names it, so the pairing holds. The words for "can't work it out" were left to me in the flow (section 9). I chose sentences shaped like the flow's two examples in 3.6, so they read as one list.

## Tests

`deploy-reaches.test.ts`: the whole list with secrets, a provider's own `baseUrl`, one entry per address and secret, the test model alone, and every kind of problem with its exact sentence. `deploy-plan.test.ts`: `plan` doesn't deploy and gives the lock as data; `deploymentRef` reads the account and the Worker.

## Covers

- app.deploy-service
