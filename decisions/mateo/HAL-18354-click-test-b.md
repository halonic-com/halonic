# Decision: the click test seeds its own Paperclip, and reuses only this workflow's installers

- Approval: the task asks for this change (HAL-18354, PR B of HAL-18317; the two findings are
  Liam's from the HAL-18353 review); Liam approves and signs this note in review
- Kind: internal

## What changes

`.github/workflows/studio-preview.yml`, three changes:

- **Installer reuse:** `resolve` takes a `halonic-installers-<commit>` artifact only from a run of
  `.github/workflows/studio-preview.yml` in this repository, started by a push or by hand
  (`path`, `head_repository` and `event` of the run that uploaded it). Before, it took the first
  unexpired artifact with that name, which any workflow, a fork's pull request included, could
  upload.
- **`click-test` needs the WSL jobs too** (`needs: [resolve, wsl-runtime, wsl-image, installer]`)
  and doesn't start when any of them failed. A skipped build job, when the run reuses installers,
  still lets it start.
- **The seed moves into the suite:** the PowerShell step no longer posts a company, a task and a
  card. It only waits for the throwaway Paperclip. `packages/testing/studio-click-test` now seeds
  the company, an agent, a task, a card on that task and a chat (`src/test-paperclip.ts`), so its
  steps know the ids they check through the API.

No permission, secret, environment or trigger changes. The Paperclip is still the loopback
`local_trusted` one that holds no secret, and CI still never holds a Paperclip key of ours.

## Why

Steps 8 to 13 (Inbox, Messenger, search, overview, Start menu, Disconnect) check their result on
the test Paperclip, so the suite has to own the seed. The reuse check closes a way to plant an
installer that the click test would then install and run on our runner.

## Tests

`packages/testing/studio-click-test` (`studio-click-test.paperclip-steps`), and run 45733391864 on
this branch, which reused main's `9c0dbb3e1` installers from its own `studio-preview.yml` run.

## Covers

- .github/
