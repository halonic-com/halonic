# git.vcs-diverged

- Status: active
- Since: 0.1.0
- Source: HAL-10717 (T9 PR 7b); `docs/adr/2026-11-16-git-guard-merges-only-with-the-ours-strategy.md`

When both the branch and its upstream have commits the other lacks, the git `Vcs` `diverged` shall fetch the upstream's remote with `--upload-pack` pinned, as `pull` does, and give the branch's commit, the upstream's commit, the commit where they parted and the sorted paths both sides changed since and now hold differently, leaving private entries out. It shall give `null` when only one side has new commits, and refuse when there is no upstream or the two share no commit. It shall change no branch, file or index entry.

## Examples

- Given a repository whose config plants `remote.origin.uploadpack`,
  when `diverged` fetches,
  then the planted program never runs.
- Given a `.env` committed on both sides with different content,
  when `diverged` runs,
  then `.env` is not in the items.
- Given a branch whose history shares no commit with its upstream's,
  when `diverged` runs,
  then it is refused and nothing changes.
