# Decision: a sandbox without its distro lists no proposals, so the Inbox shows no stale line

- Task: HAL-19066
- Approval: HAL-19066 asks for this fix; Liam approves this note in review
- Kind: user-visible

## What changes

- `studio.workspace-run-proposals`: Studio also lists no proposals when the shell can't start the
  agent host because the agent sandbox has no WSL distro yet (the shell's `wsl-missing` or
  `distro-missing`). Before, that refusal reached the Inbox, which showed "The engine isn't
  answering. Showing what it said last." above Needs you for as long as the sandbox wasn't set up.
  A host that isn't answering for any other reason, and a distro without its runtime
  (`runtime-missing`), still reach the Inbox. A new example says so.

No test is weakened or removed.

## Why

On Windows the shell runs the agent host only in Halonic's WSL distro, which is imported only
when the person presses Set up in Settings › Agent sandbox. Until then there is no host, so there
can be no proposals, and Settings already offers the setup. The installed-app click test never
sets up the sandbox, so every run showed the line (runs 45849000212 and 45850762960: failed load
`proposals host_unavailable`). A distro without its runtime may still keep proposals, so that
failure keeps its line.

## Covers

- studio.workspace-run-proposals
