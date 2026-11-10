# Decision: the session also checks the gitlinks of checked-out submodules

- Approval: the maintainer approves this change in review of HAL-3672 (HAL-3568 follow-up)
- Kind: internal

The requirement grows; nothing it promised before is taken away, and no test was weakened.

- `sandbox-srt.session` moved aside a `.git` the program planted at a gitlink in the working
  folder's own index. `git status` also looks into each checked-out submodule, and through that
  submodule's own index (`.git/modules/<name>/index`) into its submodules. A nested submodule
  that is not checked out has no `.git` the fence can deny, so the program could plant one with a
  `core.fsmonitor` setting and the user's next `git status` would run it (reproduced with git
  2.47.3).
- The check now records, at session start, the index of each submodule that is checked out,
  nested ones too, found through each one's `.git` as it was then (a `gitdir:` file or a folder).
  At session end it reads those same indexes again, with the same split-index handling, and moves
  aside a `.git` the program added, made or changed at any of their gitlinks. An index that can't
  be read at start stops the session from opening; one that can't be read at end is reported, so
  `close()` rejects. One example is added.
- The git folders are taken from the start state, not re-read at the end, so a program can't
  point the check somewhere else by rewriting a submodule's `.git` file. A rewritten `.git` file
  is itself moved aside.

A session that leaves git alone behaves as before.

## Covers

- sandbox-srt.session
