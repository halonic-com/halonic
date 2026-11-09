# memory.resource-probe

- Status: active
- Since: 0.1.0
- Source: stack 5a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan) (a memory adapter with fixed numbers); `ResourceProbe` port v1

The memory resource probe shall give the numbers it was made with, or set to later, and the sizes of the files written to it. When `maxFilesCounted` is set, `folderSize` shall count at most that many files and then say the size is incomplete. It shall refuse with a `RangeError` any number of bytes that isn't whole and 0 or more, and give copies of its processes, so a caller can't change what it holds.

## Examples

- Given a probe made with no options,
  when it is read,
  then the engine uses 64 MiB, there are no child processes and 100 GiB are free.
- Given a probe that counts at most 2 files and a folder with 3 files,
  when the folder's size is read,
  then it is the first two files' bytes, incomplete.
- Given a file size of -1 or 1.5,
  when it is written,
  then a `RangeError` is thrown.
- Given the processes 30 and 10,
  when they are listed and the list is changed,
  then they come as 10 then 30, and the probe still holds both unchanged.
