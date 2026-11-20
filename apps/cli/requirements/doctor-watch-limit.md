# cli.doctor-watch-limit

- Status: draft
- Since: unreleased
- Source: HAL-12295, decided by Liam on HAL-12296 (the CLI counts the files itself, stops one past the limit, and the words are signed off there)

While the workspace `halonic doctor` runs in has more files than Studio's folder watch looks at (50,000, as `studio.src-tauri.crates.workspace-files.folder-poll` sets it), counting the files a list of the workspace gives, `halonic doctor` shall mark the Workspace line with ! and, under the workspace's trust, say that the workspace has more files than that limit, too many for Studio to watch for changes made outside Halonic, then the fix: open a smaller folder, or move the files the workspace doesn't use out of it. It shall stop counting at the first file over the limit, so it never gives an exact count, and it shall still exit with 0 for it. The CLI's limit shall equal the shell's `MAX_WATCHED_FILES`. With `--json`, the Workspace check shall carry `tooManyFilesToWatch` with the limit.

## Examples

- Given the trusted workspace acme with 50,001 files,
  when `halonic doctor` runs,
  then it prints "! Workspace   acme · trusted on this computer", then "The workspace has more than 50,000 files, too many for Studio to watch for changes made outside Halonic." and "Fix: to see them in Studio as they happen, open a smaller folder, or move files the workspace doesn't use out of this one.", counts one warning, and exits with 0.
- Given a workspace with exactly 50,000 files,
  then the Workspace line says nothing about the watch.
- Given the shell's `MAX_WATCHED_FILES` is changed and the CLI's limit isn't,
  then a test fails.
