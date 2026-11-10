# memory.text-patch

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236): the memory Vcs's `applyPatch`

The memory adapter shall read a unified diff in git's format and work out each file's new text without writing anything: it shall apply (or, reversed, undo) each hunk only where its old lines, context included, match the file exactly, at the line its header names or moved by lines added or removed above it, keep a last line without a newline apart from one with it, and refuse a hunk that matches nowhere, a file to create that exists, a file to change that doesn't, and a deletion that leaves lines. It shall refuse with a `RangeError` a patch it can't read or that does more than edit, create or delete a plain text file's lines: no file, a binary change, a quoted path, a path without `a/` or `b/`, a rename or a copy, a mode change, a symbolic link, a gitlink or a new executable file, a `diff --git` line whose file the lines don't change, a file changed in two places of one patch, or a hunk whose lines don't match its header. A refused patch next to a change it could apply is refused whole. A hunk that matches nowhere is refused with a message that names its file.

## Examples

- Given `x.yaml` with two changed hunks,
  when the patch of the second hunk is reversed and applied,
  then only the second hunk is undone.
- Given a hunk whose lines were edited since, when it is applied, then it is refused with `The change no longer matches the file.`
- Given a patch with `Binary files a/x and b/x differ`, when it is read, then it is refused.
- Given a patch with `new file mode 120000`, when it is read, then it is refused with a `RangeError`, before any file is read.
- Given a patch that renames `x.yaml` and changes `keep.yaml`, when it is read, then all of it is refused, `keep.yaml` included.
- Given a patch that changes `x.yaml` in two sections, when it is read, then it is refused.
