# studio.feedback-windows

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); the windows in `studio.src-tauri.feedback-capture`; what they show in `feedback.overlay` and `feedback.unavailable`

When the desktop app's page loads in the window labelled `feedback-unavailable`, it shall show only the window that says screen capture isn't available. That window shall open no workspace and show none of Studio's window: no Welcome, title bar tabs, places or status bar. The selection overlay has no window of its own: it shows inside the Studio window where the shortcut was pressed (`feedback.overlay`, `feedback.in-app`).

## Examples

- Given the page in the window labelled `feedback-unavailable`,
  when it loads,
  then it says "Studio can't take a screenshot for feedback on this system." and nothing else of Studio.
