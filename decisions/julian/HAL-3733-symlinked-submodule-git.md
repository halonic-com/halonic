# Decision: a submodule's `.git` link is followed only to a real folder inside the working folder

- Approval: the maintainer approves this change in review of HAL-3733 (HAL-3672 follow-up)
- Kind: internal

The requirement grows; nothing it promised before is taken away, and no test was weakened.

A checked-out submodule's `.git` can be a symbolic link to its git folder. Git follows it, so
`git status` in the working folder reads that folder's settings and index, and looks into the
gitlinks in that index. Both checks treated such a link as "other" and stopped there. Reproduced
with git 2.47.3:

- A `.git` with `core.fsmonitor` planted at a gitlink in the linked submodule's index ran on the
  next `git status`, and the session-end check didn't move it aside.
- A program that pointed the link at a git folder of its own was not seen either: the check saw
  "other" before and after, so the user's next `git status` ran that folder's `core.fsmonitor`.

What changes:

- **Which links are followed.** The link is followed only when its target is a real folder inside
  the working folder (`.git/modules/<name>` or anywhere else there) with no further link on the way.
  Then both checks treat it like a `gitdir:` file naming that folder: the fence denies its `config`,
  `config.worktree`, `hooks` and `commondir`, and the session-end check reads its index.
- **Any other link stops the session from opening**, from either check, with a message that says
  to replace the link with a `gitdir:` file. "Any other" means a link that leads outside the working
  folder, to nothing, or through another link. The fence may let the program write there (the temp
  folder, say) or make the folder, and neither check could see that. Failing closed costs little:
  the link has to be the user's own setup from before the session, and it's rare.
- **The link itself is not denied.** srt resolves a denied path to its real path, so denying the
  link would make the whole git folder read-only and break git in the submodule. Instead, the
  session-end check records the link's target at start. A link the program adds, removes or points
  elsewhere counts as a change and is moved aside to `.git.halonic-blocked`, at any gitlink.

A session that leaves git alone behaves as before. The working folder's own `.git` is handled as
before; only submodule checkouts change.

## Covers

- sandbox-srt.session
