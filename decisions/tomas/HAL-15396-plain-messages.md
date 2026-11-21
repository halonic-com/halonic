# Decision: a routine's run, a connector that isn't local and doctor's summary say why in plain words

- Approval: the task HAL-15396 asks for these changes, from flow check C570 #6 and #7 and its doctor note (HAL-15386). The team decides them under the HAL-2282 rule, since they reword messages that are already there. Liam signs this note in review.
- Kind: user-visible

## What changes

- `format.routine-file`: a routine `run` that is neither kind gets a message instead of Zod's "Invalid input". It is "An agent routine takes prompt, not input." for an agent with `input` and no `prompt`, and "run needs a workflow, with its input, or an agent, with its prompt." otherwise. The code stays `invalid_union`. A workflow with `prompt` already gets Zod's unknown-key message, so it keeps that. One example is added, and the `run: { hub: billing }` example gains its message.
- `workspace.local-only-sheet-hosts`: a plugin or integration connector that isn't local in a local-only workspace now names its reason. Either its plugin isn't installed here or can't be read, or its integration's sheet can't be read, so nothing says which hosts it reaches. Or its file says `local: false`. Or its sheet reaches nothing outside this computer and its network, but the file doesn't say `local: true`. Only in that last case does the message offer `local: true`, because then that key does make it local, as the requirement already counts it. A connector whose sheet lists outside hosts gets the same message as before, without the `local: true` hint. The example for an uninstalled plugin changes to the new message, and one example is added. Which connectors count as local doesn't change.
- `cli.messages` and `cli.doctor-report`: doctor's summary says "won't start until the sandbox is fixed." instead of "until it's fixed.", which read wrong after "3 problems.". Three examples change their quoted sentence.

## Why

C570 #6: `run: { agent: reporter, input: … }` is an easy slip, since workflows take `input`, and `validate` said only "Invalid input (invalid_union)", in `--json` too. C570 #7: "Connector "notes" isn't local" for a connector to a local integration read as a contradiction, with no reason given. The doctor note: after "3 problems.", "until it's fixed" doesn't say what "it" is.

## Tests

No test was weakened or skipped. `routine.test.ts` adds the agent-with-input test and checks the message of the run with neither kind. In `local-only.test.ts`, the test of sheets it wasn't given now expects the reason, and a test for a missing `local: true` is added. The doctor tests in `words` and the CLI expect the new sentence.

## Covers

- format.routine-file
- workspace.local-only-sheet-hosts
- cli.messages
- cli.doctor-report
