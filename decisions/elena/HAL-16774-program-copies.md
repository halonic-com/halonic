# Decision: a workspace connector may start in a program copy the agent host holds

- Task: HAL-16774
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16260 (Liam approved the plan with changes on HAL-16260; security PR 1 of it, Julian's security sign-off)
- Kind: internal

## What changes

`agent-host.connector-routes` said a connector's workspace folder must be one of the folders the
launcher named. It now may also be a program copy the agent host holds at that moment
(`agent-host.program-copy-routes`, new in this pull request): a git worktree of a named workspace at
a run's commit, made by the host in its own folder in the profile. For a copy, the host checks the
trust grant against the record of the workspace the copy was made from, requires every working
folder to be inside the copy (compared as real paths, so a link inside the copy that leads out is
refused), and adds the copy's own `files/agents`. A path the host doesn't hold, released, swept or
made up, stays 403 `workspace_not_named`. The requirement gains three examples for this; no example
was removed and no test was weakened or skipped.

`openProgramFolders` and its test move unchanged from `apps/cli/src/` to the new package
`@halonicjs/adapter-program-copies-node`, so the CLI and the agent host share it. The test file
under `apps/cli/src/` is gone because it moved, with its 12 tests for `app.runs-read-latest-version`;
the only edit is its folder clean-up, which now calls `rm` with the same retries instead of the
CLI's test helper.

## Why

Studio's window runs a live-version run from the latest commit, but the connectors' programs
still started in the workspace folder, so a script an agent saved but nobody made live could run.
The CLI already starts them in a copy at the run's commit (HAL-4975). The agent host now makes the
same copy, so the window can do the same in PR 2 of HAL-16260. The trust record names the
workspace, not the copy, and the copy holds only what git holds at a commit of that workspace, so
the workspace's grant is the one that covers it.

## Covers

- agent-host.connector-routes
- apps/cli/src/program-folders.test.ts
