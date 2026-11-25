# Decision: the desktop shell saves a file a run created where the person picks

- Approval: Paperclip task HAL-17832, the board's option A on HAL-12421 (24 Nov); Liam reviews the code and Julian signs this note
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:hV2gM2IppNm6THlMmgwn3pVjUsZe4mmQ9sJ1PutY+WNX4qYnS+5dJw8AOR9mKm2cFtZVNl06eL6geh0K+ygmBA==

The run page's Items line names the files a run created ("Created 1 file: weekly-report.md"), but
the file existed only in Halonic's blob folder, so the person couldn't use it. The board approved
**Save…** for each file, with the system's save dialog. The shell gets one new command,
`run_file_save`, and nothing else changes.

What it may read:

- Only the run folder and the blob folder of a workspace the person opened in the shell, worked out
  by the shell as for `run_events` and `blob_get` (`folder_not_open` otherwise). The page sends the
  workspace, a run id and a hash, never a path.
- Only a file that run's own log names: the shell reads that run's log under its lock and needs an
  `artifact.created` event with that hash. Any other hash, also one stored by another run, is refused
  as `unknown_artifact`; bytes no longer stored as `missing_blob`. Both refuse before a dialog shows.
  This is defence in depth, not a hard limit: on desktop the same page can append an
  `artifact.created` naming any stored hash with `run_append`, and it can already read blobs with
  `blob_get`. The real protections are the person's own save dialog and the local-only capability.

What it may write:

- Only the file the person picks in the shell's own save dialog (rfd, as for the WSL backup), with
  the shell's window as its parent. The page can't draw, fill in or answer it. The run's name for the
  file is only the suggestion, cut to its last part and without control, zero-width or
  direction-changing characters, so `../../.ssh/config` suggests `config`.
- No overwrite without the dialog's own question: rfd asks GTK for it
  (`gtk_file_chooser_set_do_overwrite_confirmation`), and the Windows and macOS save panels ask by
  default. Cancel, closing the dialog, or a platform with none (Android) writes nothing and answers
  `{ "saved": false }`.
- The bytes are written as stored, unchanged; the path the person picked is followed as the system
  dialog gave it. A write that fails part-way is reported as `io`.

Who may call it: only `capabilities/desktop-run-files.json`, local, the `main` window, desktop
platforms. The served Studio is refused, as for every command (`studio.src-tauri.served-page`), and
a test pins the capability's window, `local` and its one permission.

The file's bytes are the model's words as the run saved them. Halonic doesn't check what is in
them; the threat model says so in its new row under 4.2.

## Covers

- studio.src-tauri.run-file-save
- studio.src-tauri.served-page
- studio.desktop-run-file-save
- runs.run-view.receipt-items-save
