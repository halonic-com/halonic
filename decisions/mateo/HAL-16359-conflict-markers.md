# Decision: `pnpm check` fails on leftover merge-conflict markers

- Task: HAL-16359
- Approval: Liam asked for this check on HAL-16359; he reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NeZfoSEbrY9jqWdqpH16ilOSfEb1RkLMg2KrOJIa3yWY2/bHnsJJ+cCU2PW0Yswl9jBW44FpE1KKY5DN/lCCAA==

## What changes

- `tooling/check/src/rules/conflict-markers.ts`: a new `conflict-markers` rule in `pnpm check`. It fails a tracked text file with a line starting with `<<<<<<< ` or `>>>>>>> `, or `=======` alone on its line, and gives the file and line. Binary files are skipped.
- `tooling/check/src/rules/all.ts` registers the rule.
- `docs/guides/checks.md` gets a row for it.

## Why

On `halonic-com/cloud`, a pull request went green with conflict lines left over from a rebase. They sat inside a doc comment, so typecheck and tests passed. Nothing in this repo would have caught that either. `pnpm check` already runs in CI and in the merge queue, so the rule costs no new job.

## Tests

No test was skipped or weakened. `conflict-markers.test.ts` covers the three markers inside a doc comment and in Markdown (with a CRLF line ending), a lockfile, lines that only look similar (a heading underline of eight `=`, an indented marker, a marker without the space, `=======` followed by text) and a binary file. The test builds its marker lines from parts, so the test file itself passes the rule. Nothing on `main` holds such lines, so nothing is excluded.

## Covers

- tooling/check/
