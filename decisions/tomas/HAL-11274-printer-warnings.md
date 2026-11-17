# Decision: a command result can carry warnings; the JSON document keeps outside text raw

- Task: HAL-11274
- Approval: Liam reviews this change on HAL-11274 (a team decision with no board card, HAL-2282 rule). He signs this note.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AyHrGmdAwsTzjPOVWg6VISPGadiujs8lBRyLVb1hb2NDEDprz4lMc5kiLNqwAbRFpDJ7UdaOBD2ly9cW0qK9Dw==

## What changes

A command result can carry warnings. They go to stderr after the result lines and are left out
of `--json`, whose document holds the result. The requirement `cli.json` gets one new last
sentence: outside text, such as a tool's name or description from a server, goes into the
document as it was written.

## Why

`halonic tools review` needs a warning line for the case where nobody can answer its questions.
The new sentence in `cli.json` only writes down what `json.ts` already does: JSON escapes control
characters itself, and a caller must match fingerprints and names on the exact text. Writing it
down stops someone from "fixing" it later by making the document's text printable. No test was
weakened or skipped.

## Covers

- cli.json
