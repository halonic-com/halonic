# cli.trust-state-run-version

- Status: active
- Since: unreleased
- Source: HAL-16335 (trust answers for the version that runs); builds on `cli.serve-trust-gate`, `cli.commands.routines.list` and `cli.commands.trust.run-version`

The trust gate of `halonic serve` shall answer for the version served runs start from: the live version at its newest commit, or the saved files with history off. The trust line and `--json` `trusted` of `halonic routines` shall answer for the version `halonic routines watch` starts, read as `halonic trust` reviews it; when git can't start, they shall answer for the saved files, as the rest of that list does. A saved change that isn't committed shall then leave both as they are until it is committed, so the `halonic trust` they point to can always clear them.

## Examples

- Given a workspace with history trusted with `halonic trust`, and a saved change to a connector that isn't committed, when `halonic serve` is asked for its trust state, then it answers `trusted`.
- Given the same workspace with a routine, when `halonic routines --json` is run, then `trusted` is `true`.
