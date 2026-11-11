# Decision: WSL probes in the sandbox spike workflow

- Task: HAL-5407
- Approval: Liam approves this note in review on the review task of HAL-5407
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KHIZ4hk/57wc+SYXccw6O/IjqC8m1+CKIziXvtW8VRkjMTswhP7HVNqgT8YxRLTnB90pMpH0T+gzb8tABezWCg==

## What changes

The report-only workflow `.github/workflows/sandbox-windows-spike.yml` ("Sandbox Windows spike") gets:

a new step that runs `packages/adapters/sandbox-srt/scripts/windows-wsl-probe.mjs`. It checks whether
srt's sandbox account can register and start a WSL distro of its own with `wsl --import` (WSL 1 and
WSL 2, each with a control run outside srt), and if it can, whether that distro reads a denied file
or reaches a blocked address. It also imports and starts a WSL 2 distro outside the sandbox, to see
whether the runner can host the `srt-wsl` attack suite. The probe uses Alpine's minimal root file
system (3.6 MB), downloaded from Alpine's mirror and checked against a pinned SHA-256 before use.
The shared probe kit now reports INCONCLUSIVE, not PASS, when srt itself fails to start.

A desktop `windows-11-arm` runner was tried on this branch for the WebDAV probe and dropped: srt
can't log on its sandbox account there.

Triggers and rights don't change: `workflow_dispatch` and changes to the spike's own files,
`contents: read`, checkout without kept credentials, no secrets.

## Why

Two open points of the Phase 5 design (HAL-3779, sections 3 and 10) and the security review
(section 8): whether native srt can ever leave experimental (if the sandbox account can register its
own distro, it can't), and whether a GitHub-hosted Windows runner can run
WSL 2.

## Tests

No test was weakened or skipped. The probe is report-only, like the rest of the spike workflow. It
ran on this pull request's branch through the workflow's existing `pull_request` path trigger.

## Covers

- .github/
