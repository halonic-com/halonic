# Decision: update Defender's signatures before the winget installer scan

- Task: HAL-17204 (follow-up from Liam's review of #5424 on HAL-1457)
- Approval: Liam approves this note in review on HAL-17204
- Kind: internal

## What changes

In `.github/workflows/winget.yml`, a new step runs `MpCmdRun -SignatureUpdate` before the step
that downloads the installer and scans it with Defender. It fails if the update fails, and logs
the signature version and date the scan will use. It also runs on pull requests that change the
workflow, which read no secret either way.

Triggers, rights, runners and secrets don't change.

## Why

A hosted runner's Defender signatures are as old as its image, which can be weeks. The scan is
what stands between a release and the winget pull request, so it should use current signatures.
A failed update stops the run rather than scanning with old signatures; the run can be started
again by hand from the Actions tab.

## Tests

No test was weakened or skipped. The workflow's pull request run updates the signatures on a
`windows-2025` runner, so this pull request's own run shows the update works there. The scan
itself still runs only for a published release.

## Covers

- .github/
