# runs.run-view.receipt-items-save

- Status: active
- Since: unreleased
- Source: HAL-17832; the board's option A on HAL-12421 (Save… for each created file on the Items line); "Saving…", "Saved <name>." and "Couldn't save <name>. Try again." are a team decision under HAL-2282

Where the app can save a run's file, each file's row under the receipt's Items line, one per file the run created in the order first saved, shall have a **Save…** button after its **Open** (`runs.run-view.open-file`), which screen readers hear as "Save… <name>". When the person presses **Save…**, the page shall ask the app to save that run's file by the hash of its last save, never by a path, and the button shall say "Saving…" until the app answers. When the file is saved, the file's row shall say "Saved <name>."; when the person cancels the save dialog, it shall say nothing; when saving fails, it shall say "Couldn't save <name>. Try again." Where the app can't save, such as a served page or a phone, the rows shall have no **Save…**.

## Examples

- Given the Acme Weekly report run that created weekly-report.md,
  when the person presses Save… on weekly-report.md,
  then the app is asked to save that run's file with the hash its `artifact.created` event gives.
- Given the same run and the person picks a file in the save dialog,
  then the row says "Saved weekly-report.md.".
- Given the same run and the person cancels the save dialog,
  then the row says nothing.
- Given a served page, which can't save,
  then Items shows "Created 1 file: weekly-report.md" and no Save….
- Given the desktop app, which can open and save the file,
  then weekly-report.md's row has Open weekly-report.md, then Save….
