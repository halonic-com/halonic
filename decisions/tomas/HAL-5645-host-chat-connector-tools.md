# Decision: the routines watch's lower `expect` count on this pull request is run-to-run noise

- Task: HAL-5645 (follow-up to HAL-5503)
- Approval: Liam approves this note in his review of this pull request on
  HAL-5645
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Bon2bLD5UHo2N3rFpwPIOTxKRaBFCxE/mFyHCTdRvrU87hRE1b7DjabTVYJ04V2deNG1FkoeIlAQZb/H94iMCA==

## What changes

Nothing in `cli.commands.routines.watch`. This pull request changes the CLI's engine host
(`apps/cli/src/local-engine-host.ts`) and its test, so the requirement guard compares the
`expect` counts of every requirement in `apps/cli` (HAL-5568). It flagged
`cli.commands.routines.watch` twice, with different numbers each time: 229 against 235, then
231 against 239 after a re-run of the same commits.

## Why

The watch's tests check inside `vi.waitFor`, which calls `expect` again on every retry, so the
count depends on how fast the runner is. HAL-5568 saw the same drift with no code change
(221 against 232). This pull request edits no test, helper or fixture of the watch. The watch
opens the same engine host, but what a run does there doesn't change: `connectors` stays empty
unless a caller passes some, and the watch passes none; `connectorToolsOf` is the code
`runDefinitionsOf` already had, moved into its own function; and the two new callbacks are only
called by a chat turn, which the watch never starts. No test was removed or skipped; the host's
tests only grow.

## Covers

- cli.commands.routines.watch
