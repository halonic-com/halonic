# contracts.vcs-commit-version

- Status: draft
- Since: 0.1.0
- Source: HAL-3317, HAL-3419 (review records, HAL-3323); plan point 8 of HAL-3245 (Create version); engine answer point 3 (HAL-3267); `Vcs` port v2

Where an adapter implements `Vcs` port version 2, `commitVersion({ message, include, exclude })` shall commit, on the current branch with HEAD as its only parent (none in a repository with no commits yet), every new, changed and deleted file on disk under `include` (the whole workspace when absent), and return the new commit's full id; it shall commit the working tree's content, not the index's. Every path under `exclude` shall keep its content at HEAD in the commit, even when the repository tracks it and it is changed: an excluded new file is not added, an excluded deleted file stays, and a renamed item excluded by both its paths stays at its old path. It shall leave every file in the working tree byte for byte as it was, and afterwards the status shall be exactly the excluded and not included changes, staged or not as they were before. It shall commit the message as the message, whatever it starts with, and refuse, changing nothing, when no change is left to commit. It shall refuse with a `RangeError`, changing nothing, every path the port refuses, private ones included, in `include` and `exclude`, and read every other path as that file or folder only, never as an option or a pattern. It shall never commit a private entry (`.env`, `.env.*`, `.envrc`, `.studio`), at the root or in a folder, even when the repository doesn't ignore it. It shall never commit a change under `.halonic/review/` (the assistant's per-device review records, named in the port's `unversionedFolders`), whatever `.gitignore` says and whatever `include` names: a file there that HEAD tracks keeps its content at HEAD, and a new one is not added; every other file under `.halonic/` is committed as usual. Every method shall reject on a folder that isn't a repository.

Draft until the port's version 2 has `commitVersion` with the memory Vcs (HAL-3245 PR 2b); the git adapter follows (PR 5). Refusing when no change is left is proposed with these cases, as `commit` refuses with nothing staged.

## Examples

- Given `a.yaml` changed, `b.yaml` deleted and `d.yaml` new,
  when `commitVersion({ message: "Create version", exclude: [] })` is called,
  then the commit has the new `a.yaml` and `d.yaml` and no `b.yaml`, its parent is the old HEAD, and the status has no changes.
- Given tracked `a.yaml` changed, `b.yaml` deleted, `d.yaml` new and `c.yaml` changed,
  when `commitVersion` excludes `a.yaml`, `b.yaml` and `d.yaml`,
  then the commit has `a.yaml` and `b.yaml` as HEAD has them and no `d.yaml`, the new `c.yaml`, and the status still lists the three excluded changes.
- Given `old.yaml` renamed to `new.yaml`,
  when `commitVersion` excludes both paths,
  then the commit has `old.yaml` as before and no `new.yaml`, and the rename is still staged.
- Given changes in `agents/` and in `x.yaml` and `y.yaml`,
  when `commitVersion` is called with `include: ["agents", "x.yaml"]`,
  then only those changes are committed and `y.yaml` is still changed.
- Given a tracked file named `*.yaml` and a changed `a.yaml`,
  when `commitVersion` excludes `*.yaml`,
  then `a.yaml` is committed and only the file named `*.yaml` is left out.
- Given an un-ignored `.env` and `agents/.env.local` in the workspace folder,
  when `commitVersion` is called with or without `include: ["agents"]`,
  then the commit holds no private entry and both files are unchanged on disk.
- Given a repository,
  when `commitVersion` gets `.git/config`, `.env` or `../x` in `include` or `exclude`,
  then it rejects with a `RangeError` and nothing changes.
- Given HEAD tracks `.halonic/review/b.json` and `.halonic/review/old.json`, `b.json` is changed, `old.json` deleted, `c.json` new under that folder, and `.halonic/notes.md` and `.halonic/reviewer.md` new,
  when `commitVersion` is called with or without `include: [".halonic"]`,
  then the commit has both records as HEAD has them and no `c.json`, the two `.halonic/` files are committed, and every record is unchanged on disk; with `include: [".halonic/review"]` it refuses, as no change is left.
