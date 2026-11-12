# Decision: run, runs and routines requirements say Acme

- Task: HAL-6610
- Approval: Sofia decided on [HAL-6610](/HAL/issues/HAL-6610) that one workspace reads one way, by its workspace.yaml name (UX, a team decision with no board card, HAL-2282 rule); #2037 made the CLI print that, and Tomas checked these lines against the tests on main on [HAL-7106](/HAL/issues/HAL-7106); Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3HShK+fGM6pDXP4Z3KDtk6XVY7lpebrDmkwX3PmIS7q5ePVYc5ALjdO1mf2sHOzN8Y7zQG8P0EIb/aKy4Z3wCA==

## What changes

The examples in `cli.commands.routines.list`, `cli.commands.routines.watch`,
`cli.commands.runs.list` and `cli.commands.runs.show` name the workspace Acme, its
workspace.yaml name, where they said acme, its folder name: "No routines in Acme yet.",
"Watching 1 routine in Acme.", "No runs in Acme yet.", "No failed runs in Acme.",
"There's no workflow called "suport-reply" in Acme.", "Support reply in Acme · run a1b2c3",
"There's no run 01jd8x in Acme." and "Two runs in Acme end in a1b2c3.".

Only the workspace name in those sentences changes. `--dir ./acme` stays, as it is the folder.
No example was removed or weakened, and the exit codes stay the same.

## Why

#2037 changed `run`, `runs` and `routines` to print the workspace.yaml name, as `doctor` and the
trust line already did, and its tests print Acme. The requirement files still quoted the old
output, so they described lines the CLI no longer prints.

## Covers

- cli.commands.routines.list
- cli.commands.routines.watch
- cli.commands.runs.list
- cli.commands.runs.show
