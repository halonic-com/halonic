# Decision: split the trust command's tests by flow

- Approval: HAL-15222, from Liam's review of #4502 on HAL-15117
- Kind: internal

`apps/cli/src/commands/trust/command.test.ts` reached 500 lines, the file-size
limit, so the next test added there would fail `pnpm check`. Its tests are
split by flow into files next to it:

- `no-terminal.test.ts`: `halonic trust` without a terminal.
- `fingerprint.test.ts`: the fingerprint it shows and accepts.
- `changed-since-trusted.test.ts`: a workspace that changed since it was trusted.

`command.test.ts` keeps the terminal flow, the user-info refusals and
`--list` / `--remove`, so 12 of its 22 tests still run there. The other 10 run
unchanged in the new files under the same requirement IDs, so no requirement
loses a test or an `expect` call. The shared setup moved to
`apps/cli/src/test/trust-kit.spec.ts`; inside the test bodies the only edits are
`folder` to `folder()` and `store` to `store()`.

## Covers

- apps/cli/src/commands/trust/command.test.ts
