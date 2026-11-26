# Decision: a fast-track build shard with a cold disk snapshot restores GitHub's Turbo cache

- Task: HAL-19780
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19248 (the board via ci-fasttrack, 26 Nov 13:45 UTC, item 3: fast-pool runs need a Turbo restore step); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i6iQ3uFlFUfsm7/miEeck9RIQVcy45udTmXtsuqBYPG13dCzVHQYVlDs6bn+dui9sTKgb/VeB36IsWblgDbECQ==

The build job on the fast pool reads Turbo's results from the CI server's disk snapshot (`/cache/turbo`, an overlay refreshed every 5 minutes) and skips GitHub's cache restore. In 12 fast-track pull request runs on 24 to 26 Nov, that snapshot was either warm (91-98% of typecheck and test tasks cached) or cold (0-14%), while a pull request on GitHub's runners at the same time had 87-96%.

## What changes

- In `.github/workflows/ci.yml`, the build job's step "Choose the Turbo cache folder": on a pull request with the disk cache mounted, it lists the shard's typecheck task hashes with a Turbo dry run and counts how many results `/cache/turbo` holds, as `pr-turbo-cache` does. Under half, it warns and uses `.turbo/cache`, so the existing `actions/cache/restore` step (merge parent's key first) runs, as on GitHub's runners.
- A warm snapshot, merge groups and pushes to `main` keep today's path. Nothing is saved from a pull request, and which cache a job may write doesn't change.

## Why

- **A cold snapshot costs minutes.** A cold shard reruns every typecheck and test task.
- **Restoring on every fast run would cost about 15 s per shard** (HAL-15467 removed it for that reason) and gain nothing when the snapshot is warm. The dry run costs a few seconds.

## Covers

- .github/
