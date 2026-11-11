# fs-node.run-store-private-files

- Status: active
- Since: 0.1.0
- Source: HAL-5215; code review of 11 Nov (HAL-5196)

The folder run store shall keep its files private to the user, as the profile's other stores keep theirs, since run logs and snapshots hold prompts, tool results and model output: it shall create its root folder with mode `700`, or make an existing one so, and create each log, snapshot and run lock with mode `600`. A log that is a symbolic link, even one to nothing, a hard link (a file with more than one name), or not a plain file shall be refused on read and append with a `RangeError`, without writing through it. A snapshot that is a link shall not be used. On Windows the modes mean nothing; the profile folder's own permissions protect the files there.

## Examples

- Given a new root folder,
  when the first append with a snapshot is made,
  then the folder has mode `700` and `r1.jsonl` and `r1.snapshot.json` have mode `600`.
- Given a root folder made earlier with mode `755`,
  when an append is made,
  then the folder has mode `700`.
- Given `r1.jsonl` is a symbolic link or a hard link to a log outside the folder,
  when `events("r1")` or `append("r1", 1, [event 2])` is called,
  then it throws a `RangeError` and the file outside is unchanged.
- Given `r1.snapshot.json` is a symbolic link to a valid snapshot outside the folder,
  when `snapshot("r1")` is called,
  then it gives `null`.
