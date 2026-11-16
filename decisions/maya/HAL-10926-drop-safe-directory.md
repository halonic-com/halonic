# Decision: drop `safe.directory` from the WSL import source reads

- Task: HAL-10926
- Approval: Liam approved the change in his review of pull request #3137 (HAL-10929), and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bGEuvEM5tDadz31AIwYUCrTb6+22WnQv7slFDXFFaOBeWuBE6nM9AOc48OGsV30Vz/f+qgBe5Ng2E/roBfo7BQ==

## What changes

The WSL import read its source folder with `-c safe.directory=<source>`, on the belief that Windows owns
those files. Julian's real-PC probe (HAL-10927) showed that the import mount shows every file as owned by
root (mode 700), so git, running as root, never stops with "detected dubious ownership". The option did
nothing, so the source reads no longer pass it, and the comment in `wsl-import.ts` now says why.

The requirement `sandbox-srt.wsl-import` gains a short note with the probe result. It holds only while the
mount has no `uid=` option, and the distro needs GNU coreutils. No behaviour, test or golden file changes.
The guard counts any change to an active requirement's file as an edit, so it needs this note.

## Covers

- sandbox-srt.wsl-import
