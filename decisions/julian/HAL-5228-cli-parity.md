# Decision: compare the new CLI with the old CLI's recorded calls

- Approval: HAL-187 item 9, assigned by Liam on [HAL-5228](/HAL/issues/HAL-5228); the six new entries, the CLI rules and the new gap are on HAL-5228, signed off by Liam in review on HAL-5313
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GW2NqPpS9rvyw5WdoeaU4MjFh++6VjnOqxi4RJfnBAmOLS73uewKHzPSnc6IZ4JAGlH7i7kknBpMnsE6K4W9Dw==
- Task: HAL-5228

## What changes

The parity compare gets a fourth part, for the base's CLI calls (`parity.compare-cli-calls`). The
CLI's own `parity.test.ts` (`cli.parity-cli-calls`) makes the 13 calls of `cli-calls.ts` again with
`halonic test` and `halonic run`, on a fresh copy of the base each, from the old fixed clock, with
counted IDs and the fixture trusted through the memory `TrustStore`. Each call is compared with
`cli.json` exactly: exit code, stdout, stderr, and every stored run with its events in order, after
the CLI rules that allowed differences name in a new optional field, `cliRules`. A call that still
differs fails unless a known gap names it in a new optional field, `calls`.

`allowed-differences.json` changes in two ways:

- Three signed-off entries also name their run-log rule in `cliRules`, because the same difference
  shows in the CLI's runs: child run IDs (`run-ids-by-start`), `definitionsVersion`
  (`no-definitions-version`) and the waiting labels and title (`waiting-labels-and-title`). Nothing
  else about them changes.
- Six new entries, signed off by Liam in review (HAL-5313), each with the requirement that makes the new behaviour right and
  the one CLI rule it allows: the words come from the message catalogue (`cli.messages`), exit codes
  by error kind (`cli.exit-codes`), `halonic test` stores no runs (`cli.commands.test.run-tests`),
  `run.failed` carries a `reason` (`events.run-failed-reason`), the not-JSON error quotes the answer
  (`engine.task-json-answer`) and a foreach item's failure names its state (`engine.budget-composite-stops`).

## Decisions

- **The words are left out, not compared.** HAL-1541's note said the CLI compare would check the
  words. None of the old words is kept: every sentence comes from the catalogue the board approved
  (HAL-2123), and the catalogue's own tests check it. The exit code and the stored runs are what
  stays comparable, and they are compared strictly.
- **Exit code 3 is never folded.** `exit-codes-by-kind` turns the new 2 and 4 to 9 into the old 1,
  but not 3: the base is trusted, so a trust refusal must show as a difference.
- **A requirement ID may have a command's folders in it.** `cli.commands.test.run-tests` lives in
  `apps/cli/src/commands/test/requirements`, so the reader accepts more than one dot, and the test
  that checks every cited requirement exists now also reads `apps/*` and their commands' folders.
- **Known gaps may name calls instead of tests.** `parity.known-gaps-checked` changes: a gap lists
  its `tests`, its `calls` or both, and a call must be one of `cli-calls.ts`. Before, every gap had
  to list tests. That is the only edit to an active requirement.
- **One new gap, HAL-5291.** The old CLI refused to start a run whose Google connector wasn't
  signed in; the new one starts it. For 0.1 that is covered by `cli.local-engine`: a CLI run gets
  no connectors at all, so nothing checks sign-in (Liam decided this on HAL-5285). It stays a gap,
  not an allowed difference, because HAL-5291 brings the connectors and the old refusal back, so the
  new behaviour has to change.
- **HAL-4754 names the two echo-model calls.** The CLI test checks that, apart from the old
  `llm.request` and `llm.response`, those calls match, so nothing else hides behind the gap.
  HAL-4757 and HAL-4758 name no call: the one invoice call never started in the old CLI.

## Tests changed

New tests for the CLI rules, the judge, the pairing, the `calls` field and `cliRules`.
`allowed-differences.test.ts` lists the six new requirements. `known-gaps.test.ts` reads a gap's
`tests` as optional now. No test was weakened or removed.

## Covers

- packages/testing/parity/allowed-differences.json
- parity.known-gaps-checked
