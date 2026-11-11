# Decision: a run failure with a known cause has no "report it" line

- Approval: Liam decided this on [HAL-6451](/HAL/issues/HAL-6451) (a team wording call on the approved HAL-2264 words, from the findings on HAL-6444); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:faypMKrydL3HLOeuefdqZpEEt3hJjdvCpWP9ARpKhYHxewECLt4HQJVJ4zOVeJPnMD0LOYto8HfUqqeLc4CDDw==
- Task: HAL-6451

## What changes

`cli.run-failure` gave every reason whose words aren't settled the general lines: line 1 with the
engine's message, then "Run it again with --debug to see the details, and report it". It now leaves
that line 2 out for `disk-full`, `interrupted` and `answer-not-an-option`; line 1 stays the same. One
example is added for the three. No example was removed or weakened, and no new words are written.

## Why

For these three the cause is known: the disk is full, the run was interrupted, or the answer wasn't
one of the options. A bug report doesn't help, so asking for one misleads the user. Their own hints
wait for words; any of them that needs one is proposed on HAL-6451 for Liam and Sofia to decide.

## Covers

- cli.run-failure
- apps/cli/src/run-failure-of.test.ts
