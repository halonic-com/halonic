# studio.src-tauri.run-file-save

- Status: draft
- Since: unreleased
- Source: HAL-17832; the board's option A on HAL-12421 (Save… for each created file on the Items line)

When the page calls `run_file_save` with a workspace, a run id and a hash, the shell shall look for an `artifact.created` event with that hash in that run's own log, in the run folder `runsFolder` in `@halonicjs/profile` names for the workspace, and shall read the file's bytes from the workspace's blob folder. If the log has no such event, then the shell shall refuse the call as `unknown_artifact`, and if the bytes are no longer stored, as `missing_blob`, both without showing a dialog. Otherwise the shell shall show its own save dialog, suggesting the file's name without any folder part or hidden character, write the stored bytes unchanged only to the file the person picked there, and answer `{ "saved": true }`. When the person cancels the dialog, or the platform has none, the shell shall write nothing and answer `{ "saved": false }`. The dialog shall ask before it replaces a file that is there. If the workspace is not a folder the person opened in the shell, nor inside one, then the shell shall refuse the call as `folder_not_open`.

## Examples

- Given a run whose log says it created `weekly-report.md` with hash `h`,
  when the page calls `run_file_save` for that run and `h`, and the person picks `~/Documents/report.md`,
  then `~/Documents/report.md` holds exactly the bytes stored under `h`, and the answer is `{ "saved": true }`.
- Given the same run,
  when the page calls `run_file_save` with a hash its log doesn't name,
  then no dialog shows and the call is refused as `unknown_artifact`.
- Given the same run,
  when the person cancels the save dialog,
  then nothing is written and the answer is `{ "saved": false }`.
- Given a run that saved a file named `../../.ssh/config`,
  when the save dialog shows,
  then it suggests `config`.
