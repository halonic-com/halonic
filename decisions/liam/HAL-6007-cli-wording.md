# Decision: CLI wording from the 0.1.0 output read

- Approval: Liam decided this on [HAL-6007](/HAL/issues/HAL-6007) (Sofia's CLI output read, HAL-5959), small wording on approved CLI output, a team decision with no board card (HAL-2282 rule); Priya reviewed it on HAL-6047; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yT6iZiJdb12kridBcbRSRKlYWYPzudu+V6915MPnYlBopAt3Vq9f7S9qQDY99QW/nYaEMoCaUwXviEK89BJ2CQ==
- Task: HAL-6007

## What changes

No CLI line of 0.1.0 points at the Studio any more, since 0.1.0 ships without it:

- `cli.run-live-version`: the fix when nothing is live yet says "Commit your changes with git, then
  run again." instead of "Make the workspace live in the Studio, then run again."
- `cli.commands.init.create-workspace`: a new workspace's next steps end with "Add your first
  agent: https://docs.halonic.com/examples/agent-with-a-tool" instead of "Or open the folder in
  Studio to add your first agent." (golden `init/golden/created.txt`).
- `cli.commands.init.copy-example`: the example's next steps end at `halonic run …`; the "Or open
  the folder in Studio." line is gone (golden `init/golden/example.txt`).

The no-workspace fix also offers the example: "Run it inside a workspace, create one with halonic
init, or copy the example with halonic init --example acme." (`cli.workspace-dir`,
`cli.commands.validate.check-workspace`, golden `validate/golden/no-workspace.txt`).

Each example keeps its shape and exit code; only the line's words change. The answer line of a
waiting run keeps HAL-5915's "Answer with: halonic runs send …".

## Why

Sofia's read of the CLI output against the docs on develop found lines that send a 0.1.0 user to a
Studio they don't have, and a no-workspace error that doesn't mention the quickest start, the Acme
example. A user who commits with git makes the workspace live without the Studio.

`cli.commands.routines.watch` is listed because its `expect` count differs from run to run (polling
tests, see HAL-5568) and the guard on the merge base flags it for any change in `apps/cli`. This
pull request doesn't touch routines.

## Covers

- cli.run-live-version
- cli.workspace-dir
- cli.commands.init.copy-example
- cli.commands.init.create-workspace
- cli.commands.validate.check-workspace
- cli.commands.routines.watch
- apps/cli/src/commands/init/golden/created.txt
- apps/cli/src/commands/init/golden/example.txt
- apps/cli/src/commands/validate/golden/no-workspace.txt
