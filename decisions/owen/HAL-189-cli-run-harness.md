# Decision: a source's listing gets the harness agents' working folders

- Requirement: `cli.source-listing` (`apps/cli/requirements/source-listing.md`)
- Task: HAL-189, step 4h of the implementation plan
- Approval: Julian's security check on HAL-4739 makes this a condition on wiring the working folder (tracked by Priya on HAL-4759); the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6F1se1gRFJDSI3h+nBvQB9v5P1TRn95ZZDv10kel1y479bxvJIlZQgW7TKHzbsRncbotDem586NZDXeHuu1iBw==

## What changes

`halonic tools review` reads a source's tool listing outside a run, and for a `stdio` source it
starts the source's program on this computer. The CLI now passes that program's starter the
working folder of every harness agent in the workspace, as real absolute paths, in
`ConnectorFactoryContext.workingFolders`. `adapters/mcp` already refuses a start that runs or
loads a file from one of them (`format.working-folder-start`). A workspace without harness
agents passes none, and starts its programs as before.

The requirement's sentence about what a trusted source is connected with now names the working
folders, and one example is added: a Codex agent with no working folder gives
`files/agents/<id>` under the workspace's real path.

## Why

A harness agent writes in its working folder from inside the sandbox, while a connector's
program runs outside it. Without this, an agent could write a script into its folder and have it
started outside the sandbox the next time someone reviews a source. Every harness agent counts,
not only the agents of one run, because an agent of any workflow may have written there before.

## Tests

No test was weakened. The existing listing test now also checks that a workspace without harness
agents passes no working folders, and a new test checks the folder of a Codex agent.

## Covers

- cli.source-listing
