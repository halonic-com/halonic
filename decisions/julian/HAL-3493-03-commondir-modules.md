# Decision: the session-end git check also covers submodules' git folders and indexes

- Approval: the maintainer approves this change in review of HAL-3493 (part 3)
- Kind: internal

The requirement grows; nothing it promised before is taken away, and no test was weakened.

- `sandbox-srt.session` already undid a `commondir` the program added, changed or deleted in the
  working folder's git folder and its linked worktrees. It now does so in each submodule's git
  folder under `.git/modules` too, nested ones included. A `commondir` there sends git to another
  folder for the submodule's settings, so a program could make the user's next `git status` run a
  command (`core.fsmonitor`) without writing any file the fence denies.
- The `.git` of a gitlink now also counts as changed when its git folder's `commondir` changed or,
  for a link, when its target changed. The gitlinks in each checked-out submodule's index were
  already checked by HAL-3672 (#1097), which merged first; this builds on that walk.
- Not covered: what lies behind a submodule `.git` that is already a link at session start (only
  its target is compared).
- One example is added.

The fence test for a submodule that is not checked out now also proves its attack works without
the check (before, its command was built before the marker path was set), and gains the two
checked-out submodule attacks.

Since HAL-3733, a submodule's `.git` may be a link to any real git folder inside the working
folder, not only `.git/modules/<name>`. The `.git` record therefore also takes the `commondir` of
the folder a link leads to (read only through real folders), so one planted in such a folder
outside `.git/modules` counts as a change too.

A session that leaves git alone behaves as before.

## Covers

- sandbox-srt.session
