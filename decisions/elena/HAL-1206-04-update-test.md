# Decision: a Windows update test in CI

- Task: HAL-1206
- Approval: Liam approves this note in review on the review task of HAL-1206
- Kind: internal

## What changes

`.github/workflows/ci.yml` gets a new job, `update-windows` ("Windows update (0.1.0 to 0.1.1)"),
and `ci-ok` now needs it. It runs when `ci.yml` already builds the Windows installer (Tauri or agent
host changes). It makes two throwaway updater keys in the runner's temp folder, builds the
installer three times (0.1.0, 0.1.1, and a 0.1.2 that ships a stand-in instead of the agent host)
with the test key's public half and the update address
`http://127.0.0.1:8765/latest.json`, then runs `apps/studio/src-tauri/windows/test-update.ps1`:
0.1.0 is installed, updates itself to 0.1.1 through the Studio page's own `update_*` commands
(driven over WebView2's DevTools port, local to the runner) and opens again; the user's files are
byte-for-byte the same; a signature from the other key and a failed download change nothing; the
0.1.2 that never proves it starts is replaced by 0.1.1 again, through the installer 0.1.1 kept.

Rights: `contents: read`, checkout without kept credentials, no secrets, nothing uploaded. The keys
never leave the runner.

## Why

Failure path rule 2 and the done line of HAL-1206: an installed 0.1.0 must update to 0.1.1 and
restart, without touching user data. Only an install on a real Windows runner shows that.

## Tests

No test was weakened or skipped. The job is new and required.

## Covers

- .github/
