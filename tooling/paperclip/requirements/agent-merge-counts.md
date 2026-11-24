# paperclip.agent-merge-counts

- Status: active
- Since: unreleased
- Source: HAL-17627; question 5 in section 4.3 of the phase 2 architecture note on HAL-17511 (D2)

When the board check runs its 10-minute pass, the Agent tools plugin shall keep, from the PR watcher's GitHub snapshot and without a GitHub request, each pull request merged into a default branch from an agent's branch, as its number, the agent and the merge time only, for 30 days; and when a board user asks the `GET /github/summary` route, the plugin shall answer, per agent, the merges of the 7 and 30 days before the snapshot was taken, with the time from which merges are counted.

## Examples

- Given a first snapshot that keeps 3 days of closed pull requests, with acme/app#11 merged from `mateo/HAL-11-change`, #12 merged from a fork and #13 merged from `boss/try-a-thing` by the board,
  when the job runs,
  then it keeps only acme/app#11 for mateo, and counts from 3 days before the snapshot.
- Given acme/app#11 already kept, and a later snapshot that still lists it,
  when the job runs again,
  then acme/app#11 is kept once.
- Given mateo's merges 2, 10 and 31 days before the snapshot,
  when a board user asks for the summary,
  then mateo has 1 merge in 7 days and 2 in 30 days, and the merge from 31 days ago is no longer kept after the next pass.
- Given a saved record with an entry whose agent is 300 characters long,
  when it is read back,
  then that entry is skipped.
