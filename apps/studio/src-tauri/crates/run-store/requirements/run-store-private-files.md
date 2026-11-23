# studio.src-tauri.crates.run-store.run-store-private-files

- Status: draft
- Since: unreleased
- Source: HAL-16342; `fs-node.run-store-private-files`; the threat model's "A run is changed after the fact" row

The shell shall keep the run folder's files private to the user and never follow a link to them, as `fs-node` keeps them, since run logs and snapshots hold prompts, tool results and model output: it shall create the run folder with mode `700`, or make an existing one so, and create each log and snapshot with mode `600`. It shall report an append as stored only once its lines are flushed to disk, and write a snapshot through a new private file, flushed to disk, and a rename. If a log is a symbolic link, a hard link (a file with more than one name) or not a plain file, then the shell shall refuse to read or append to it with `broken_log`, naming the log, and write nothing through it. If a snapshot is a link, then the shell shall not use it. On Windows the modes mean nothing and a hard link isn't told apart; the profile folder's own permissions protect the files there.

## Examples

- Given a new run folder,
  when the first append with a snapshot is made,
  then the folder has mode `700` and `r1.jsonl` and `r1.snapshot.json` have mode `600`.
- Given a run folder made earlier with mode `755`,
  when an append is made,
  then the folder has mode `700`.
- Given `r1.jsonl` is a symbolic link or a hard link to a log outside the folder,
  when the shell reads `r1`'s events or appends to `r1`,
  then it refuses with `broken_log` and the file outside is unchanged.
- Given `r1.snapshot.json` is a symbolic link to a snapshot outside the folder,
  when the shell reads `r1`'s snapshot,
  then it gives none.
