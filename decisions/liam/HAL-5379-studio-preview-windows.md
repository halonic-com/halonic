# Decision: a manual workflow builds an unsigned Windows preview of the Studio

- Task: HAL-5379 (the board approved an early unsigned Windows build on HAL-45, 11 Nov)
- Approval: reviewed on a Paperclip review task, Liam signs this note as the CTO
- Kind: internal

## What changes

A new workflow, `.github/workflows/studio-preview.yml`, that only runs by hand (`workflow_dispatch`). It builds the Windows installer with the same script as CI's `installer-windows` job, installs it silently, checks that Halonic starts and keeps running for 20 seconds, and keeps the setup `.exe` as an artifact for 7 days. It holds no secret, signs nothing, creates no tag and no GitHub Release, and changes no other workflow, check or setting.

## Why

The board asked for an early build it can install itself once the window (HAL-1290) and Workspace (HAL-1291) were merged. CI's installer job builds the installer but only keeps screenshots of its pages. Because the repo is public, the artifact can be downloaded by any signed-in GitHub user, so the workflow is only run once the board has approved how the file reaches them.

## Covers

- .github/
