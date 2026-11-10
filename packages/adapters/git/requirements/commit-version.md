# git.commit-version

- Status: active
- Since: 0.1.0
- Source: engine answer points 2 and 3 (HAL-3267); plan point 8 of HAL-3245, with Julian's command review (HAL-3358); HAL-3245 git part 5

When a version is created, the git Vcs shall build its tree in a temporary index under `.git`, starting from HEAD: every change on disk is added, then every changed path outside `include`, under `exclude`, private or under an unversioned folder goes back to HEAD's content, so a private entry HEAD tracks keeps it. It shall refuse when nothing is left to commit, commit the tree with `commit-tree`, unsigned and with the author it was given, and move HEAD with `update-ref` from the commit it was at, refusing when HEAD moved meanwhile. The real index shall then take the new commit's content for the paths the version changed, and no other; the working tree is never touched, and no temporary index stays behind.

## Examples

- Given HEAD tracking `.env` and `.env` changed on disk,
  when a version is created,
  then the version's `.env` is HEAD's.
- Given `commit.gpgSign=true` in the repository's config,
  when a version is created,
  then the commit has the given author and no signature.
