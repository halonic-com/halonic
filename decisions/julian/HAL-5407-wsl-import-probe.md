# Decision: WSL probes and a desktop Windows runner in the sandbox spike workflow

- Task: HAL-5407
- Approval: Liam approves this note in review on the review task of HAL-5407
- Kind: internal

## What changes

The report-only workflow `.github/workflows/sandbox-windows-spike.yml` ("Sandbox Windows spike") gets:

- a new step that runs `packages/adapters/sandbox-srt/scripts/windows-wsl-probe.mjs`. It checks
  whether srt's sandbox account can register and start a WSL distro of its own with `wsl --import`,
  and if it can, whether that distro reads a denied file or reaches a blocked port. It also tries
  to import and start a WSL 2 distro outside the sandbox, to see whether the runner can host the
  `srt-wsl` attack suite. The probe uses Alpine's minimal root file system (3.6 MB), downloaded
  from Alpine's mirror and checked against a pinned SHA-256 before use.
- a second runner, `windows-11-arm` (desktop Windows, free for public repositories), next to
  `windows-2025`. Desktop Windows has the WebClient service the server runner lacks, so the existing
  WebDAV probe can run there. That job is `continue-on-error`: it never fails the workflow.

Triggers and rights don't change: `workflow_dispatch` and changes to the spike's own files,
`contents: read`, checkout without kept credentials, no secrets.

## Why

Two open points of the Phase 5 design (HAL-3779, sections 3 and 10) and the security review
(section 8): whether native srt can ever leave experimental (if the sandbox account can register its
own distro, it can't), WebDAV on desktop Windows, and whether a GitHub-hosted Windows runner can run
WSL 2.

## Tests

No test was weakened or skipped. The probe is report-only, like the rest of the spike workflow. It
ran on this pull request's branch through the workflow's existing `pull_request` path trigger.

## Covers

- .github/
