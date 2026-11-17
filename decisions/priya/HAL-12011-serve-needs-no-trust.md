# Decision: `halonic serve` accepts a workspace that needs no trust

- Approval: decided by Liam on HAL-12011 (from the real CLI run on HAL-12006); Liam approves this note in review
- Kind: internal
- Task: HAL-12011, from HAL-12008

## What changes

`halonic run` skips trust for a workspace whose runs can only reach the test
model (`reachesOnlyTheTestModel`), such as the example Acme, and
`halonic trust` says such a workspace needs no trust and records nothing.
`halonic serve` didn't ask that rule: on a fresh Acme folder it exited 3
asking for `halonic trust`, which answers that nothing is needed, so there was
no way out.

`serve` now asks the same rule, in one shared helper (`needsNoTrust`) that
`run`, `routines watch` and `runs send` use too:

- `cli.commands.serve.serve`: a workspace that needs no trust starts without a
  trust record, at the first check and for every later version. A workspace
  that reaches a real provider or a connector still exits 3.
- `cli.serve-trust-gate`: for such a workspace the gate answers `trusted` with
  "This workspace needs no trust: it reaches only the test model." It is read
  at every check, so an edit that adds a connector or a real provider turns the
  answer back to `new` at once. `TrustState` and `halonic trust` don't change.

Nothing else in either requirement changes.

## Why

Recording trust for a workspace that starts nothing would give a trust record
a second meaning. Asking one rule in every command keeps `run`, `trust` and
`serve` agreeing. The sentence builds on the approved "needs no trust" line of
`halonic trust` (a wording decision on an approved screen, HAL-2282).

## Covers

- cli.commands.serve.serve
- cli.serve-trust-gate
