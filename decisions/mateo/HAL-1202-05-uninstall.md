# Decision: the installer job uninstalls through the uninstaller's pages

- Task: HAL-1202
- Approval: Liam approves this note in review on [HAL-1202](/HAL/issues/HAL-1202)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:D5vgT/MWsOMn291CjcRpCFF5WXGuL5+SFXsFmAF75Ht4WVpSo+LzU2ydI+wiQW4HnWrCv7mCYkSmQnShgeZhCA==

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job changes in three places. No other job, trigger or permission changes.

- The silent install check also expects `sandbox-remove.ps1` in the install folder.
- The step that tests `sandbox-step.ps1` with a stand-in agent host also tests `sandbox-remove.ps1`: nothing set up (exit 20, no removal), removed (0) and a stopped removal with its reason (11).
- The last step, `Uninstall`, which ran `uninstall.exe /S`, is replaced by `test-uninstall.ps1`, which walks the uninstaller's pages, plus an upload of their pictures (`halonic-uninstaller-pages`).

## Why

The uninstaller now has our own pages (flow 2.7) and removes the agent sandbox. The CI job is the only place it runs on Windows. The new step checks that Cancel is the default button and that Enter removes nothing. It then checks that Uninstall, with the settings box ticked, removes Halonic, the sandbox's account, the trust records and the harness settings, keeps the runs, and ends on "Halonic is uninstalled".

## Tests

No test was skipped or weakened. The old step's two checks (Halonic.exe and the uninstall entry are gone) are in the new script.

## Covers

- .github/
