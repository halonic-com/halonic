# Decision: compare the base's run logs, with run-log rules and known gaps

- Approval: step 8 of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), approved by Liam on [HAL-1515](/HAL/issues/HAL-1515); the compare's design and the six new entries are on [HAL-1541](/HAL/issues/HAL-1541#document-findings), for Liam to sign off in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LknneIWgshepiujA4GaRKU69M3PEBetnCSfwJsdHyjL5hSfVg2l6lb6xM5HotrXJi4RIGGAUs33mgHoy7mTEAw==
- Task: HAL-1541

## What changes

The parity compare gets a third part, for the base's run logs (`parity.compare-run-logs`). It
pairs the old runner's 8 workflow tests with the new runner's and compares each exactly, after the
run-log rules that allowed differences name in a new optional field, `runRules`. A test that still
differs fails unless a new file, `known-gaps.json` (`parity.known-gaps-checked`), names it with the
task that fixes it.

`allowed-differences.json` changes in two ways:

- `parallel-branch-name-order` (signed off on HAL-3703) names its rule, `parallel-branches-by-name`,
  as the HAL-3689 note said step 8 would. The rule only reorders sibling branch entries and the
  context they wrote, nothing else.
- Six new entries, all `proposed`: child run IDs made from the step, `definitionsVersion` as the
  blob hash, the added `run.waiting` labels and title, the child context in `workflow.finished`, the
  new summary fields, and foreach starting the next item at once. Each cites the requirement that
  makes the new behaviour right, and names the one rule it allows.

## Decisions

- **Rules, not written-out results.** The file compare writes each allowed old and new result out in
  full. A run log is hundreds of events, so an entry here names a rule in code instead. Each rule
  takes out or reorders one named thing, on the side it names; a rule that changes no test is stale
  and fails, like an entry whose fixture no longer differs.
- **Known gaps are not allowed differences.** Where the new engine is wrong (no agent instructions
  or model-call events in workflow runs, JSON output kept as text, methods, signals and
  conversations ignored, the initial context missing from a running run's summary), the test is
  excused only by a gap with a task. A gap whose tests match is stale, so each fix has to remove
  its gap.
- **Failures by number.** The old runner gave sentences, the new one data; the CLI's own compare
  (HAL-187 item 9) checks the words.

## Tests changed

New tests for the rules, the judge and the known-gaps file. `allowed-differences.test.ts` lists the
six new requirements and tests `runRules`. No test was weakened or removed.

## Covers

- packages/testing/parity/allowed-differences.json
