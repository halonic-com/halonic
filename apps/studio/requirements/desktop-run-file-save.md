# studio.desktop-run-file-save

- Status: active
- Since: unreleased
- Source: HAL-17832; the board's option A on HAL-12421; the shell's `studio.src-tauri.run-file-save`

The desktop app shall give each workspace's run page **Save…** through the shell's `run_file_save`, naming the workspace, the run and the file's hash and never a path. When the shell answers that it saved the file, the page shall hear `saved`; when the person closed the dialog, `cancelled`; when the shell refuses, or answers anything else, the save shall fail with that reason.

## Examples

- Given the workspace `acme` and its Weekly report run,
  when the person presses Save… on weekly-report.md,
  then the shell is asked `run_file_save` with `acme`, the run's id and the file's hash.
- Given the shell answers `{ "saved": false }`,
  then the page hears `cancelled`.
- Given the shell refuses as `unknown_artifact`,
  then the save fails with that refusal.
