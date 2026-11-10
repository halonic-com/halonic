# Decision: the git adapter refuses a push URL and links out of the git folder

- Approval: the adapter's owner (Tomas, HAL-2669) approves this change in review of HAL-3986
- Kind: internal

The requirements grow; nothing they promised before is taken away, and no test was weakened.

Two findings from the attack tests on HAL-3971, reproduced with git 2.47.3:

- **`remote.<name>.pushurl`.** The adapter refuses `url.<base>.pushInsteadOf` because it sends a
  push to a server the person doesn't see. A planted `remote.origin.pushurl` does the same:
  `push` went to another repository, while `remotes()` still showed the real one. It is now
  refused like `pushInsteadOf` (`git.repo-leaks`).
- **Links inside `.git`.** With `.git/objects` linked to another repository's objects,
  `readAt` read a file only that repository had, and `snapshot` wrote a commit into it. A linked
  `.git/refs` let `createBranch` make a branch there, and a linked `.git/logs` let `commit` write
  outside. Before every call the adapter now asks git where `objects`, `refs`, `logs`, `info`,
  `index` and `packed-refs` are (`rev-parse --git-path`) and refuses the repository when the real
  path of one is outside its git folder, or when one is a link that leads nowhere yet. A link that
  stays inside the git folder is still allowed (`git.repository`).

A repository without such a key or link behaves as before. The Rust `git-guard` gets the same
cases on HAL-3811.

## Covers

- git.repo-leaks
- git.repository
