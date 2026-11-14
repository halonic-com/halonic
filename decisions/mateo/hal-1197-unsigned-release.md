# Decision: the 0.1.0 Windows installer is released unsigned

- Task: HAL-1197
- Approval: the board's decision on HAL-1197 (Timothy, 14 Nov, "Ship unsigned"); Liam approves this note in review on the review task for PR 2601
- Kind: internal

## What changes

In `.github/workflows/release.yml`, real runs get a `pack-unsigned` job. `sign-windows` runs only
when the repository variable `WINDOWS_SIGNING` is `true`. Without it, the installer is packed with
no Authenticode signature, and the job checks that it is unsigned. The draft release notes then say
the installer is unsigned and why SmartScreen warns. Dry runs are unchanged.

Triggers, rights and runners don't change. The new job has no Azure login and no signing identity.
It uses the `release` environment only for the updater key.

## Why

The board decided 0.1.0 ships unsigned. Signing comes back for 0.1.1 by setting `WINDOWS_SIGNING`.

## Tests

No test was weakened or skipped. Dry runs still sign with a throwaway certificate.

## Covers

- .github/
