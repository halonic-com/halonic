# Decision: clearer paths, test steps and test-file hints in init, validate and test

- Approval: the task HAL-12126 asks for this change, from the new-user flow check on HAL-12121; small wording on approved screens, a team decision under the HAL-2282 rule. Julian signs, since Liam wrote it.
- Kind: user-visible

## What changes

- A folder more than two folders up from the current one is shown as its full path, not as `../../../…`, in every message that shows a workspace folder and in the `cd` of `init`'s `Next:` block. Up to two folders up, it is shown as before.
- `halonic init` into an empty folder adds `halonic test` with its why-words to the `Next:` block, after `halonic validate`.
- `halonic test` in a workspace without tests says what a `<workflow>.test.yaml` holds and points to the Acme example.
- A failed test whose expected final step, or one of whose expected steps, isn't a step of the workflow names every step of that sentence by its id in quotes and lists the workflow's step ids. Before, the expected side was an id and the actual side a title.

## Why

The new-user flow check on HAL-12121 found that these places confuse a first-time user: a long `../` chain is hard to read, an empty workspace's next steps stop at the docs link, the no-tests line doesn't say what a test file looks like, and a typo in a step id was shown next to a step title.

## Tests

No test was weakened or skipped. The `states` sentence in `apps/cli/src/output/test-report.test.ts` now expects the new wording for an unknown step, with the same number of checks. The init golden file gains the `halonic test` line.

## Covers

- cli.workspace-dir
- cli.commands.init.create-workspace
- cli.commands.test.run-tests
- apps/cli/src/commands/init/golden/created.txt
