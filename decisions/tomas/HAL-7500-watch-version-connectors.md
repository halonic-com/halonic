# Decision: in `routines watch`, a run's connectors start from the version it read

- Requirements: `cli.local-engine` (`apps/cli/requirements/local-engine.md`)
- Task: HAL-7500, the follow-up named in the HAL-6277 B1 note
  (`decisions/tomas/HAL-6277-02-cli-run-connectors.md`)
- Approval: Liam approves this note in his review of this pull request on
  [HAL-7500](/HAL/issues/HAL-7500)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lL5ub1djOuzYnWxtEq+dyOA2DLhD6xIE+Trjz5CQpA1NqJufKlsdn92HB5BRlRNjHpN804qGXPUYmz/ZjS5iCQ==

## What changes

Since #2095, `halonic routines watch` opens its engine over the workspace's versions (`versions`),
and HAL-6277 B1 started no run's connectors in such an engine: the turn of an agent that listed a
connector failed. Now they start, from the version the run read:

- `WorkspaceVersions` gets `trustedVersionOf(version)`: the version a run read, with the grant of
  that version's own trust check. In the watch, `WatchedVersions` loads it as `definitionsOf`
  does, refuses a version that turns local only on or off, and runs the trust check again. The
  grant is never the one the watch started with, and never that of the version read last.
- The trust check runs again for each run's connectors rather than reusing the grant from the
  run's start. A run that waits can open its connectors hours later, or in the next watch, which
  never checked its version; a trust removed in between then starts nothing. The check is a read
  of the trust store, once per run, since a run's steps share one start.
- The watch's version checks are now two: `trust`, which returns the grant `checkRunTrust` gave
  and which the earlier check dropped, and `sandbox`, for the workflow a run starts.
  `definitionsOf` passes both, `trustedVersionOf` only `trust`: the sandbox is about the agents
  a run starts, which its start already checked. Until the watch sets its checks, a version
  passes with no grant, so no program starts.
- `FolderRunConnectors` takes one `versionOf(run)` for the connector files, the grant and the
  harness agents' working folders, all of the same version, in place of `connectorsOf`,
  `workingFoldersOf` and the context's fixed grant. `halonic run` and `runs send` give their one
  workspace and the command's grant, as before.
- Reading a run's version for its connectors doesn't change the version read last, which only a
  run's start moves.

When the version can't be read, changes local only or fails its trust check, no connector starts
and the step that needed one fails with that error, as any failed connector start does.

## Tests

No test was weakened. The test for the refusal it replaces, "starts no connector of a run in an
engine over several versions", is gone with the refusal. `local-run-connectors.test.ts` has 2 new:
a run's connector starts from the files of the version it read, created with that version's grant,
and a version that fails its check starts nothing and gives its error. The new
`watch-versions.test.ts` has 3: `trustedVersionOf` checks the run's version, not the one read
last, returns that check's grant and leaves the version read last as it is; there is no grant
before the watch sets its checks; and a version that turns local only off is refused before its
trust check. `run-connectors.test.ts` keeps its 11 on the new `versionOf`.

## Covers

- cli.local-engine
