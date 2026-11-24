# Decision: a deploy failure says which version is still live, and a lost lock says what to do

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:3aBXw/LIrPhU//g/5o3t1fvRgLlibIlwMM9Tv6lHMrLUD+kal6LxhkT0/l1U5brO7IoHqNgnuuZ2E0PHV40lDg==

## What changes

- `cli.deploy-output` covers the failure lines. When the target says what still serves (a stopped deploy, or a lock lost before the switch), line 1 ends with "Version <n> is still live." or "Nothing is live on <deployment> yet.", the line under it names the step it stopped after, and the fix is the target's own, else the stop's or "Run halonic deploy again.". `--json` holds `live` and `stoppedAfter`. It also takes the HAL-15925 wording: "already up to date" when the host gives neither the commit nor the Halonic version.
- `deploy.lock` gives a lost lock its fix: "Run halonic deploy again once the other deploy has finished." when another deploy took over, "Run halonic deploy again." when the hold was lost for another reason.
- `deploy.record` says that a record R2 refuses to read fails `plan`, `status` and `rollback` rather than count as none. That is what the code already does; only the sentence and a test are new.

## Why

HAL-16750 (document c757) and words check C759 row 3 (HAL-16746): since PR 12, a lock lost after the snapshot was written fails with `live` and `stoppedAfter`, but the command line only had the success lines, so the user would see the lock's message alone and not know the live version was untouched (deploy flow 3.7). Only the target knows whether another deploy took over or the hold was lost, so it gives the fix through the port's existing `DeployFailure.fix`; no port change. Julian's PR 13 note asked for the `deploy.record` sentence: failing rather than guessing is the safe side for `Deploy? [y/N]`.

## Tests

`deploy-failure.test.ts`: the take-over line with the target's fix and the step, a first deploy with nothing live, a stop after creating the database with the stop's fix, `--json`'s `live` and `stoppedAfter`, and a failure without `live` given back as it is. `lock.test.ts`: both lock-lost fixes. `port-failure.test.ts`: the fix passes to the port's failure. `deploy-target-plan.test.ts`: a refused record read fails `status`, `plan` and `rollback`. `deploy-output.test.ts`: the "already up to date" line.

## Covers

- cli.deploy-output
- deploy.lock
- deploy.record
