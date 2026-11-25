# studio.feedback-windows

- Status: active
- Since: unreleased
- Source: HAL-18970 (plan on HAL-18919); the windows in `studio.src-tauri.feedback-capture`; what they show in `feedback.overlay` and `feedback.unavailable`

When the desktop app's page loads in a window the shell labelled `feedback-overlay-<n>`, it shall show only the feedback selection overlay; in the window labelled `feedback-unavailable`, only the window that says screen capture isn't available. The feedback windows shall open no workspace and show none of Studio's window: no Welcome, title bar tabs, places or status bar.

## Examples

- Given Acme first in Recent,
  when the page loads in the window labelled `feedback-overlay-0`,
  then it shows the overlay, asks the shell for that screen's still and opens no workspace.
- Given the page in the window labelled `feedback-unavailable`,
  when it loads,
  then it says "Screen capture for feedback isn't available on this system yet." and nothing else of Studio.
