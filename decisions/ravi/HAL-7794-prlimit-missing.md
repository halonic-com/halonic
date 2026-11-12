# Decision: a Linux machine without prlimit starts the runner with the heap limit only

- Approval: the requirement edit needs Liam's sign-off (docs/guides/checks.md, requirement guard); Liam signs this note in the sign task on HAL-7794
- Kind: internal
- Task: HAL-7794

## What changes

- `integration-runner.heap-limit` names one more gap next to macOS and Windows: a Linux
  machine without `/usr/bin/prlimit` (NixOS, a minimal Alpine) gets the heap limit only.
  A new example says the runner starts anyway and Halonic says so once.
- `startRunner` looks for `prlimit` on the host before it opens the session, and
  `runnerCommand` leaves it out when it isn't there. The sentence goes to the new
  `onNotice` option, once per process.

## Why

The hard-coded `/usr/bin/prlimit` made the runner impossible to start on such a machine,
which is worse than starting it without the buffer limit (review of halonic#2260).

## Known gaps

- macOS, Windows and Linux without `prlimit`: no limit on memory outside the JS heap.
- Callers must pass `onNotice` to show the sentence; without it nothing is said.

## Covers

- integration-runner.heap-limit
- packages/adapters/integration-runner/src/halonic/start-runner.test.ts
- packages/adapters/integration-runner/src/halonic/runner-profile.test.ts
