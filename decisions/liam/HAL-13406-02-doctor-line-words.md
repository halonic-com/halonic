# Decision: the doctor's lines are worded in the shared words package

- Approval: Liam planned it on HAL-13406 (first-run-progress 4.2, sized on HAL-8005 item 1); Mateo checked it on HAL-14801 and Julian signs, because Liam wrote it
- Kind: internal
- Task: HAL-13406

## What changes

`doctorLineWords(line, face)` in `@halonicjs/words` decides which of the doctor's sentences each
line says, in its order, as sentences, fixes and docs links, the Secrets and Network lines
included. Before, that was in the CLI's
`output/doctor-report.ts`, so Studio would have had to copy it. The CLI now lays out what it
returns and prints a docs link as `More:`, as before. The Sandbox line stays with each face,
because its reason and fix differ between the CLI and Studio on purpose (`sandbox-studio-words`).
`printable` and the docs links move to the package too, and the CLI re-exports them.

The CLI's output is unchanged. Its doctor-report tests, which pin the printed report line by
line, aren't touched and pass, and `halonic doctor --dir examples/acme` prints the same bytes as
on `main`.

## Tests

No test is weakened. `apps/cli/src/output/printable.test.ts` moves with its code to
`packages/core/words/src/printable.test.ts`, with every case kept and one added for
`withoutUnsafe`.

## Covers

- apps/cli/src/output/printable.test.ts
