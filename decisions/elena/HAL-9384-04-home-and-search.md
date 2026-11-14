# Decision: wording of Home's empty runs and the overview's no-match line

- Approval: Sofia's design check on HAL-9316 (section B5, B6); HAL-9384 asks for these wording changes on approved microcopy revision 96
- Kind: user-visible
- Task: HAL-9384

## What changes

`runs.home` now adds, under "No runs yet. When an agent or workflow runs, you'll see it here.", the
sentence "Studio shows what your agents are doing and lets you read each run. To start one, use the
command line: `halonic run`." so Home never ends on nothing. It shows only while there are no runs.

`shell.overview.states` now words the no-match line as `No skills match "zzz".` (the feature passes
the noun) and the shell draws a **Clear search** button under it.

## Why

A new workspace's Home had no way forward, and a search with no match had no way back.

## Covers

- runs.home
- shell.overview.states
