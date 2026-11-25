# studio.src-tauri.background-start

- Status: draft
- Since: unreleased
- Source: HAL-18088; decision D9 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212, section 5)

When Halonic starts with exactly one argument, `--background` (the login item's start), the shell shall open no window and shall start a background engine for each workspace recorded as open at the last Quit, taking the workspaces only from the profile's `studio/open-at-quit.json`, never from arguments. Each recorded workspace shall open again only as a reopened picked folder does, and only while it still holds a `workspace.yaml`; a folder that is gone, changed, no longer picked or no longer a workspace shall be skipped, with the reason in the shell's log, and every engine shall check trust as any engine does. When Halonic quits, or restarts for an update, the shell shall record the workspaces whose engines it started, at most as many as it remembers picked folders. If the tray wasn't built, or on Linux, where a tray can build with nothing showing, then a start with `--background` shall exit without starting an engine and without changing the recorded list; an ordinary start shall open its window whatever the tray does. When Halonic runs already and is started with `--background` again, the running Halonic shall open nothing. A list that is missing, damaged, over 64 KiB or of another version shall start nothing.

## Examples

- Given Halonic quit with the workspaces acme and notes open,
  when it starts at login with `--background` on Windows,
  then no window opens, the tray shows, and the engines of acme and notes start.
- Given notes was deleted since the last Quit,
  when Halonic starts at login,
  then only acme's engine starts.
- Given a desktop with no tray, or Linux,
  when Halonic starts at login,
  then it exits, and the recorded list stays as it was.
- Given Halonic running in the tray,
  when the login item starts it again,
  then no window opens.
- Given a start with `--background /acme/other`,
  when Halonic starts,
  then it is an ordinary start: Studio's window opens.
