# studio.src-tauri.google-setup-command

- Status: draft
- Since: 0.1.0
- Source: HAL-9378; `setupRecords` and `setupCollection` in `@halonicjs/google-setup`; `openGoogleHost` in the CLI; `studio.src-tauri.workspace-data-commands`

When the page calls `google_setup_read`, the shell shall answer the whole lines of the Google setup records, the collection `_google_setups` in the folder `google/setups` of the CLI's profile, plus the log's absolute path in `file`, for messages, and shall only read them: no command writes, replaces or removes a setup record. The command shall take no argument, so the page names neither a folder nor a collection. The shell shall never read or answer the sealed client secrets or tokens the CLI keeps in `google/tokens`, nor any other file in `google`. A profile with no saved setup shall answer no lines and make nothing. The command shall be granted to the app's own local main window only, never to the Studio the computer serves.

## Examples

- Given two saved setups in the profile,
  when the page calls `google_setup_read`,
  then it answers the log's lines holding both.
- Given a profile whose `google` folder has no `setups` folder,
  when the page calls `google_setup_read`,
  then it answers `""` and the `google` folder is still missing.
- Given a client secret file in `google`, and the log of the client secrets in `google/tokens`,
  when the page calls `google_setup_read`,
  then neither is in the answer.
- Given a request from the computer's served Studio,
  when it calls `google_setup_read`,
  then the shell refuses it like every other command.
