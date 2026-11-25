# Decision: the Windows network capture counts updates.halonic.com as an update host

- Approval: the board decided the update address on HAL-18474 and the task asks for it (HAL-18480); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1MvCAD+yPwwfFwgf4R4kdE6cDr6GppWYcwdEZ0D3kAXPrNburzUdAXt14v07feFv+HCg2eaBoD8pMblaWcxoAA==

## What changes

Studio's updater now asks `https://updates.halonic.com/<track>/{{target}}-{{arch}}/{{current_version}}`
instead of `latest.json` on GitHub (`studio.src-tauri.update-track`). The Windows network capture
probe (`.github/probes/network-capture/windows/report.mjs`, run by hand from
`network-capture.yml`) allows a Halonic process to connect to update hosts only; it now counts
`updates.halonic.com` as one, next to GitHub's hosts, where the Worker sends the download.

Nothing else under `.github/` changes: no workflow, trigger, right, runner or secret.

## Why

Without it, the next capture would report Studio's own update check as an unexpected connection.

## Tests

The probe has no test of its own; the next hand-run capture shows it. The updater's endpoint per
track is tested in `apps/studio/src-tauri/crates/update-state/src/track_tests.rs` and
`apps/studio/src-tauri/src/updates_check_tests.rs`.

## Covers

- .github/
