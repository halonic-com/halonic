# Decision: the sandbox choice reads the saved setting and covers N backends

- Approval: Paperclip task HAL-5392, built on the HAL-3779 design (sections 2.2-2.4 and 6) that Liam wrote; he approves this note in review
- Kind: internal

## What changes

`app.sandbox-choice` chose between srt and MXC from an MXC `on`/`off` setting. It now reads the
person's saved `SandboxSetting` (the `SandboxSettingStore` port from HAL-5392 part 1) and reports
every backend with its offer, state, reason, limits and residuals. A setting that names a backend
runs only that backend, `none` runs no sandbox, and with no setting the platform's default list
applies: `srt-wsl` only on Windows, `srt` elsewhere, never `none`, native srt or MXC. A failed
check still never falls through to another backend, and a failed trust check still keeps that
backend off until the next start. The MXC default constant and the MXC setting are gone, because
the one setting replaces them.

`app.doctor-mxc` reads the MXC backend from the choice: anything but in use is failed when the
person chose MXC, and a failed trust check of an MXC nobody chose is a warning. Nothing is
weakened: no backend is picked that the person didn't name or the default list didn't offer, and
the trust check, its one-at-a-time rule and the re-check on `not-fenced` stay.

`memory.sandbox-setting-store` and `contracts.sandbox-setting-store` now require `save` to refuse
a choice that isn't valid, as Liam asked in review of part 1.

## Covers

- app.sandbox-choice
- app.doctor-mxc
- memory.sandbox-setting-store
- contracts.sandbox-setting-store
