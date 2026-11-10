# memory.text-patch

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236): the memory Vcs's `applyPatch`

The memory adapter shall read a unified diff in git's format and work out each file's new text without writing anything: it shall apply (or, reversed, undo) each hunk only where its old lines, context included, match the file exactly, at the line its header names or moved by lines added or removed above it, keep a last line without a newline apart from one with it, and refuse a hunk that matches nowhere, a file to create that exists, a file to change that doesn't, and a deletion that leaves lines. It shall refuse a patch it can't read: no file, a binary change, a quoted path, a path without `a/` or `b/`, a rename, or a hunk whose lines don't match its header.

## Examples

- Given `x.yaml` with two changed hunks,
  when the patch of the second hunk is reversed and applied,
  then only the second hunk is undone.
- Given a hunk whose lines were edited since, when it is applied, then it is refused with `The change no longer matches the file.`
- Given a patch with `Binary files a/x and b/x differ`, when it is read, then it is refused.
