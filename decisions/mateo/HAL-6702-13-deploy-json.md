# Decision: each deployed version keeps a record, and a plan names what it would take over

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:WBCDOTMOhE0vBkBQkK1/JFL5vgjxEKKCZoQC7w6vbYYkq/DB1/8RkvW3m8YKntVw4JJs1llhnIH1E2+4sCzJCQ==

## What changes

- `deploy.plan` reads the live version's Halonic version and reaches from that version's record (new requirement `deploy.record`). It can now say `unchanged` and give `liveReaches`. It also lists what it would take over when the request sets `adopt`, in the port's new `DeployPlan.adopts`.
- `app.deploy-service` asks `Deploy? [y/N]` when the plan would take something over, as it does for something to create.

## Why

Before this, `plan` never said `unchanged` and gave no `liveReaches`, so every deploy asked `Deploy? [y/N]` (the safe side). Deploy flow C4 says to ask only for what's new against what's live, and Cloudflare's version note has no room for the Halonic version or the reaches. So each version's record goes into the definitions bucket under `deploys/<version id>.json`, written once the version serves. Keyed by the version, a rollback finds the record of the version it brings back. A version without a record, or with one that doesn't fit, still counts everything as new.

A take-over happens only with `adopt` (`deploy.provision`; without it, an unmarked resource stops the deploy). Julian's PR 10 note: the plan dropped those steps, so the summary before `Deploy? [y/N]` couldn't say what would be taken over. `adopts` is one added field on `DeployPlan`, so the port keeps version 1. The words for the summary line come with the command.

## Tests

`deploy-target-plan.test.ts`: a live version with a record of the snapshot's commit and Halonic version is `unchanged` and gives its reaches; `adopt` lists the unmarked bucket under `adopts`, not `creates`; `status` gives the record's Halonic version and full commit; a record that doesn't fit counts as none. `deploy-target-deploy.test.ts`: a deploy writes the record, and a record that can't be written doesn't fail the deploy. `client-object-calls.test.ts`: the object read. `deploy-service.test.ts`: a plan with something to take over asks `Deploy? [y/N]`.

## Covers

- deploy.plan
- app.deploy-service
