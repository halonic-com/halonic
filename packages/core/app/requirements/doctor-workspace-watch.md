# app.doctor-workspace-watch

- Status: draft
- Since: unreleased
- Source: HAL-12295, decided by Liam on HAL-12296 (the CLI doctor counts the files itself; Studio's own watch count waits for a Studio doctor screen)

While the host finds that the workspace `halonic doctor` runs in has more files than Studio's folder watch looks at (`studio.src-tauri.crates.workspace-files.folder-poll`), the Workspace line shall carry that limit and be marked as a warning, whatever the workspace's trust: Studio won't show changes made outside Halonic as they happen. The line shall never be marked as failed for it, because runs and Studio still work there.

## Examples

- Given the trusted workspace `acme` has more than 50,000 files,
  then the Workspace line is !, carries the limit 50,000, and the summary counts one warning.
- Given `acme` needs no trust and has more than 50,000 files,
  then the Workspace line is !.
- Given `acme` isn't trusted yet and has more than 50,000 files,
  then the Workspace line is !, not ✕.
