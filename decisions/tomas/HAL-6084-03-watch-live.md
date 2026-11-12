# Decision: halonic routines watch reads the live version at each fire

- Requirements: `cli.commands.routines.watch` (`apps/cli/src/commands/routines/requirements/watch.md`)
- Task: HAL-6084, step 2b of the plan there
- Approval: Liam approves this note in his review of this pull request on
  [HAL-6084](/HAL/issues/HAL-6084)
- Kind: internal

## What changes

The save model says routine runs read the live version (`app.runs-read-latest-version`). The
watch instead loaded the saved files once when it started and ran every routine from them, so it
could run a saved change that was never made live (HAL-6021 recorded that honestly as
`{ reads: "saved-files" }`). This supersedes the watch half of `decisions/tomas/HAL-6021-run-version.md`.

The watch now reads the workspace through `WatchedVersions`, which holds the workspace's history
open while it watches and a `LiveRoutines`, the routine list the Studio's scheduler uses:

- **Routines:** read again on every tick, from the live version, each On or Off as its saved file
  says. A routine that was never made live isn't scheduled, and a target that isn't live or is in
  the trash is skipped (`targetUnavailable`), as in the Studio.
- **Each run:** records the live version at the time it is due (`LiveRoutines.runVersion`), and
  the engine starts it with that version's definitions (`definitionsOf` with the start's version,
  steps 1 and 2a). With history off, both are the saved files as they are at that time.
- **Each later version** passes the checks the first one did before a run starts from it: trust,
  and the sandbox for that run's workflow. The engine keeps the local only it opened with (2a), so
  a version that changes `privacy.localOnly` starts no run either. A version that fails starts
  none of its runs. The watch prints that run's existing ✕ "didn't start" line and keeps watching.
  Stopping the watch because someone committed in the Studio would be worse.
- **The names** in the ✕ and stuck lines come from the last tick's list, so a routine renamed in a
  newer version shows its new name.

## What a user sees

- **First line:** same words. Its count is now the live routines that are On.
- **Nothing live yet:** refused before anything starts, with `halonic run`'s own line and fix
  ("✕ Nothing is live yet, so there is nothing to run. Nothing ran.", exit 5).
- **git can't start:** refused with `halonic run`'s reason behind the watch's prefix (exit 9).
- **A version that fails a check:** the existing ✕ line. Under `--debug`, the reason is the trust
  or sandbox refusal `halonic run` gives, or one new sentence for local only ("This version of
  acme turns local only on or off, which a running watch can't change. Stop the watch and start
  it again to run it.").

All of this reuses `halonic run`'s wording except that one `--debug` sentence. It is team wording
under HAL-2282, as the plan on HAL-6084 said.

## Tests

No test was weakened. `watch.test.ts` keeps its history-off test, which still records the saved
files; only its comment changes. Its fake clock moves to `src/test/fake-time.ts` for the new
`watch-live-version.test.ts`, which runs git and covers: the live version and not a saved change,
with its commit recorded; a version made while watching; a newer version that isn't trusted; a
newer version that turns local only on; nothing live; and git that can't start.

## Covers

- cli.commands.routines.watch
