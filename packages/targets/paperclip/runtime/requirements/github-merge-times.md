# runtime.github-merge-times

- Status: active
- Since: unreleased
- Source: HAL-18161, Liam's decision (b) on HAL-18139: `github.merge-times` reads GitHub's closed pull request list in the runtime, because `tooling/paperclip`'s `merge_speed` reads the PR watcher's snapshots, which the runtime doesn't have

When a tool runs `github.merge-times`, the runtime shall read the closed pull requests of each of the tool's `repositories`, newest update first, through the runtime's GET reader, and answer, for the pull requests merged into the repository's default branch over the tool's `days`, how many merged, how many per day, and the median and longest time from `created_at` to `merged_at`, with pull request numbers and times only; every answer shall name its measure as "opened to merged", not time in the merge queue; it shall stop reading once a page reaches an update before the window, read at most 10 pages of 100 per repository and say when that limit left older merges out; and it shall name a repository after the first that the token can't reach instead of failing.

## Examples

- Given `merge_speed` on `acme/website` over 7 days, with merges into `main` that took 90 minutes, a day and 30 minutes from opened to merged, a pull request closed without merging, one merged into a stacked branch and one merged before the week,
  when Mateo calls `merge_speed`,
  then it answers "3 merged into the default branch (0.4 per day)" and "Opened to merged: median 1 h 30 min, longest 1 d 0 h", after a first line that names the measure "opened to merged".
- Given more than 1,000 closed pull requests updated within the window,
  when an agent calls `merge_speed`,
  then it reads 10 pages and says that older merges in the window are missing.
- Given `merge_speed` on `acme/website` and `acme/private-tools`, and a token that doesn't reach the second,
  when an agent calls it,
  then it answers for `acme/website` and names `acme/private-tools` as not read.
