# Decision: `init --example acme` fits 80 columns

- Approval: [HAL-6419](/HAL/issues/HAL-6419)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:48wNxLlqk0/IXYAkmXVSuYjuc5w2KsbjUP+DNd4w2aFSJwOJjwidBztKYRZdpqeBNtcgV9JoddVlLY4dYCWvCQ==

Two lines of `init --example acme` get shorter so they don't wrap in an 80-column terminal, macOS Terminal's default size, and the README's terminal recording (HAL-6395) can be 80 columns wide: the contents line ends "test model, no key needed" instead of "runs on the test model, no key needed" (85 to 73 columns), and the `halonic test` hint reads "run its tests (no key, nothing sent)" instead of "run its workflow tests (no key, nothing sent)" (83 to 74). The Acme README no longer says the wait "shows the draft": the command line shows only the step's first line, the question.

The `Next:` block names no Studio since HAL-6007 (#1880), which this decision first also covered; it now builds on that.

Maya decided the wording on the task as a small change that follows an approved decision (board, HAL-2282); Liam owns the command line and approves this note in review.

## Covers

- cli.messages
- cli.commands.init.copy-example
- apps/cli/src/commands/init/golden/example.txt
