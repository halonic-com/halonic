# Decision: `halonic run` hands its run to the running `halonic serve`

- Approval: /HAL/issues/HAL-19396 (option A, decided by Liam on the task; the signature is the reviewer's, since Liam wrote the pull request)
- Kind: user-visible

The phone part of the first-run flow has you start the demo run and approve
it on the phone, but `halonic run` refused while `serve` held the engine,
and the served Studio has no Run button. One engine per workspace stays the
rule: `run` now asks the running `serve`, over the console channel `serve
pair` uses, to start the run on its own engine, with the checks of the
served Studio's start route (trust, the live version, the sandbox). The run
shows in the phone's Inbox, and `run` ends with exit 0 and the run's id.

`cli.local-engine-lock` said every command refuses while another engine
holds the lock. It now names that exception and keeps the refusal when the
lock names another command, when `run` has `--event`, `--harness` or
`--follow` (they need the run followed in the terminal), and when the
console can't be reached or doesn't know the request. Its examples gain a
`serve` case for each; the existing examples and tests stay as they were.

The user sees a run start instead of a refusal while `serve` runs.

## Covers

- cli.local-engine-lock
