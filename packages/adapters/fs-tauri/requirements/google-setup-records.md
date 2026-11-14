# fs-tauri.google-setup-records

- Status: draft
- Since: 0.1.0
- Source: HAL-9378; `studio.src-tauri.google-setup-command`; `setupRecords` in `@halonicjs/google-setup`; `RecordStore` port v2

The Tauri Google setup records shall implement `RecordStore` over the shell's `google_setup_read` command, read-only, so `setupRecords` in `@halonicjs/google-setup` lists and reads the setup records the CLI keeps in the profile with its own rules. It shall call the command with no argument, never naming a folder, a collection or a path, and shall answer the collection it was made for from the command's lines, parsed with the port's `parseRecordLines`, and any other collection as empty without calling the shell. It shall refuse `append` and `compact` as `denied`, without calling the shell. It shall turn the shell's refusals into the same errors as the Tauri record store, and an answer that isn't the command's shape, or any other failure, into `unavailable`.

## Examples

- Given a saved setup, written by the CLI,
  when `setupRecords` over this store lists the records,
  then it gets the setup and the shell received `google_setup_read` with no arguments.
- Given the store,
  when it is asked for the changes of `leads`,
  then it answers `[]` and the shell receives no call.
- Given the store,
  when `setupRecords.start` tries to save a setup,
  then it rejects as `denied` and the shell receives no call.
- Given a shell that refuses with `broken_log`,
  when the store reads,
  then it rejects with the shell's message, which names the log.
