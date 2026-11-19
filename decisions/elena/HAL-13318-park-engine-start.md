# Decision: `shell.engine-start` is parked as a draft while the desktop engine runs in the page

- Task: HAL-13318 (continues HAL-8792, item 7)
- Approval: Liam asked for this on HAL-13318 ("retire or park `shell.engine-start` with the reason") and reviews it. A team decision with no board card.
- Kind: internal

## What changes

`shell.engine-start` goes from active to draft. Its code (`shell.engine.supervise`) and its tests
stay as they are; only the requirement no longer counts as something 0.1 ships.

The shell README says the desktop engine runs in the page and `supervise` is unused in 0.1, and the
engine README says schedules and timers only fire while the Studio window or a CLI command that
holds the engine is open.

## Why

Liam chose on HAL-6602 (option 1) to run the desktop engine in the webview. Since then the app starts
no engine process: the page opens the workspace's engine and holds its lock through the shell's Tauri
commands (`studio.engine-service`). Nothing calls `supervise`, so an active requirement for it would
promise behaviour no user meets. Parking keeps the code and tests for an engine that runs as its own
process later, rather than deleting them; retiring would mean removing its tests too.

## Covers

- shell.engine-start
