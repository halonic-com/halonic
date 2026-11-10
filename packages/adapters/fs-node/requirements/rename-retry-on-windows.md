# fs-node.rename-retry-on-windows

- Status: active
- Since: 0.1.0
- Source: HAL-3369; Liam's review of PR #942 (HAL-3311)

When the folder definition store renames its temporary file over a file on Windows and the rename fails with `EPERM` or `EBUSY`, because another program such as an antivirus scanner, an editor or the search indexer briefly holds the file open, the store shall try the rename again up to five times, waiting 10, 20, 40, 80 and 160 milliseconds before each new try. When the last try fails too, the write shall fail with that error and remove its temporary file. Any other error, and every error on other systems, shall fail the write at once.

## Examples

- Given Windows and a file held open for the first two tries,
  when the rename runs,
  then it waits 10 and then 20 milliseconds and succeeds on the third try.
- Given Windows and a file that stays held,
  when the rename runs,
  then it tries six times, waits five times, and fails with the last `EBUSY`.
- Given Linux and a rename that fails with `EPERM`,
  when the rename runs,
  then it fails at once without waiting.
- Given Windows and a rename that fails with `ENOENT`,
  when the rename runs,
  then it fails at once without waiting.
