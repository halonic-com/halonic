# Decision: the session also undoes a `.git` the program plants at a gitlink

- Approval: the maintainer approves this change in review of HAL-3568 (HAL-3493, part 2)
- Kind: internal

The requirement grows; nothing it promised before is taken away, and no test was weakened.

- `sandbox-srt.session` already undid a `commondir` the program added, changed or deleted at
  session end. It now also moves aside the `.git` of each gitlink in the working folder's index
  that the program added, made or changed, to `.git.halonic-blocked`, and reports each as a
  refused write (with `close()` rejecting when one can't be moved). This includes a submodule that
  had no `.git` at session start, which the fence can't deny (HAL-3568): the program could write
  `docs/.git` with a `core.fsmonitor` setting and the user's next `git status` would run it.
  Gitlinks are recorded at start, so one still counts when the program takes it out of the index.
  The gitlinks of a split index's shared index count too, and an index or shared index that
  can't be read is reported, so a program can't hide a gitlink by splitting the index. A working
  folder whose `.git` is a file is not checked. Two examples are added.

A session that leaves git alone behaves as before.

## Covers

- sandbox-srt.session
