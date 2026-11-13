# Decision: the CLI compare checks that a call still prints something

- Approval: HAL-8202, from the guardian review on HAL-8178; Liam reviews and signs this note
- Kind: internal
- Task: HAL-8202

## What changes

The `output-words` rule of the CLI compare used to take stdout and stderr out on both sides, so a
CLI that printed nothing at all would have passed. It now turns the output into one fact, whether the
call printed anything on stdout or stderr, and compares that. The words stay out of the compare (the
message catalogue owns them, HAL-5228), and so does the stream: the new CLI prints a heading on stdout
before an error the old CLI gave on stderr (the call "run with an event the state doesn't accept"),
which a per-stream check would have flagged.

`allowed-differences.json` changes in one text only: the `new` sentence of
`cli-output-from-the-catalogue` says the compare still checks that something is printed. No entry,
rule name or requirement changes.

## Tests

Two tests in `cli-judge.test.ts`: a new call that prints nothing where the old one printed is
`different`, and a new call that prints on another stream is still `allowed`. The CLI's own
`parity.test.ts` passes unchanged against the real calls. No test was weakened or removed.

## Covers

- packages/testing/parity/allowed-differences.json
