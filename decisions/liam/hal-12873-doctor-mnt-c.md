# Decision: doctor's Windows drive warning drops a reason that isn't true and keeps a Studio folder there

- Approval: Paperclip task HAL-12873, a team decision with no board card (HAL-2282 rule for small wording on an approved message); the Fix line is Sofia's wording from HAL-12890. Elena reviewed the PR on HAL-12873. Liam wrote it, so Julian signs this note as the security reviewer
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:1b38SgBPyDlOOexZtsD827f49TTwL49rAU/B2q+2XXJvmb1Wjl/ita2xkiefT0Gj0HmT/OiyknKh/peR4VDCCg==

`halonic doctor`'s Workspace warning under WSL, for a workspace on a Windows drive (`/mnt/<letter>`),
no longer says "Halonic doesn't notice edits made in Windows". It now reads:

- "The workspace is on the Windows drive /mnt/c, so runs are slower. If Studio on Windows opens this
  folder, keep it there."
- "Fix: if you use it only from the command line, move it into your Linux home folder (~), then run
  halonic doctor again."

The requirements `cli.doctor-windows-drive` and `app.doctor-workspace-drive` change to match. The
core one also says why edits made in Windows are still seen, and that a future `fs.watch` on the
workspace would need polling on `/mnt/<letter>`. The one changed assertion in
`doctor-report.test.ts` checks the new words. No test was skipped or deleted.

## Why

Nothing in `apps/cli` watches the workspace's files: `run`, `test` and `validate` read them on each
call, and `routines watch` and `serve` read them again every tick. So the missing file-change events
for edits made from Windows on `/mnt/c` (microsoft/WSL #4739) don't affect the CLI, and the reason
was wrong. Since a Studio folder on Windows is meant to be used from WSL 2 as `/mnt/<letter>/…`
(D-A), an unconditional "move it" would take the folder away from Studio, so the Fix line is
narrowed to folders used only from the command line.

## Covers

- cli.doctor-windows-drive
- app.doctor-workspace-drive
