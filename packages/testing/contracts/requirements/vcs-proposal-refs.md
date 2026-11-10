# contracts.vcs-proposal-refs

- Status: draft
- Since: 0.1.0
- Source: HAL-3317; plan point 9 of HAL-3245 (proposal refs); engine answer point 2 (HAL-3267); `Vcs` port v2

Where an adapter implements `Vcs` port version 2, `commitWorktreeTo(worktreeId, ref, { parent })` shall commit a worktree's files as they are on disk, private entries left out even when the parent tracks them, as a commit whose only parent is `parent`, create `ref` at it and return its full id, which `readAt` and `listAt` then read. It shall leave HEAD, the branches, the index, the working tree, the worktree and the list of worktrees as they were, and `branches` shall not list the ref. It shall refuse, keeping the first commit, when `ref` already exists. `readRef(ref)` shall give the id `ref` points at, or `null` when there is no such ref, never a branch or other ref of a similar name. `deleteRef(ref)` shall remove the ref, and refuse when there is no such ref. All three shall refuse with a `RangeError`, before anything runs and changing nothing, every ref that isn't `refs/halonic/proposals/<id>` with `<id>` of ASCII letters, digits, `-` and `_` that doesn't start with `-` (such as `refs/heads/main`, `HEAD`, `refs/halonic/proposals/../x`, `refs/halonic/proposals/-x` or an empty id). `commitWorktreeTo` shall refuse a `parent` as the versions of `readAt` are refused (a `RangeError` for anything but a full commit id, `Unknown version` for one the repository doesn't have), and a worktree id it didn't give, creating no ref. Every method shall reject on a folder that isn't a repository.

Draft until the port's version 2 has proposal refs with the memory Vcs (HAL-3245 PR 2b); the git adapter follows (PR 5).

## Examples

- Given a worktree at a snapshot with `a.yaml` changed, `b.yaml` deleted and `d.yaml` added,
  when `commitWorktreeTo(id, "refs/halonic/proposals/run-1", { parent: snapshot })` is called,
  then `readRef` gives the new commit, its only parent is the snapshot, `listAt` lists `a.yaml`, `c.yaml` and `d.yaml`, and the workspace's status, staged diffs, files, log and branches are unchanged.
- Given a proposal on `refs/halonic/proposals/run-1`,
  when a second proposal is committed to the same ref,
  then it rejects and the ref still points at the first.
- Given no ref `refs/halonic/proposals/run-1`, even with a branch of that name,
  when `readRef` and `deleteRef` are called,
  then `readRef` gives `null` and `deleteRef` rejects.
- Given a repository,
  when `commitWorktreeTo`, `readRef` or `deleteRef` gets `refs/heads/main`, `HEAD` or `refs/halonic/proposals/-x`,
  then it rejects with a `RangeError` and nothing changes.
- Given a worktree,
  when `commitWorktreeTo` gets `HEAD`, a short id or a tree's id as the parent,
  then it rejects with a `RangeError` and no ref is created.
