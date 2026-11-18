# cli.commands.proposals.list

- Status: active
- Since: unreleased
- Source: HAL-6477; option 3 on HAL-6476, approved by the board on HAL-9332 (18 Nov); wording decided by the team (HAL-2282)

The `halonic proposals` command shall list the workspace's open run proposals, newest first, through the same `RunProposals` service the engine keeps them with (`app.run-proposal-list`), one line per proposal with three columns lined up: the run's short id, how many files it changes with how many are left to decide when some were decided, and when the run finished, dimmed, by the list's When rule. It shall end, after a blank line, with the way to see one. An empty list shall say no run has changes waiting. It shall change nothing, open no engine and take no engine lock, so it works while `halonic routines watch` runs. With `--json`, it shall give the proposals as recorded, with full ids. Every suggested command shall keep the user's `--dir`. It shall exit 0 whenever it lists, empty or not.

## Examples

- Given run `01JD8Q` proposed changes to 2 files 5 minutes ago,
  when the person runs `halonic proposals`,
  then it prints `01jd8q   2 files   5 minutes ago` and `See one with halonic proposals show <run-id>.`
- Given no run proposed anything,
  when the person runs `halonic proposals`,
  then it prints `No run in Acme has changes waiting for you.` and exits 0.
