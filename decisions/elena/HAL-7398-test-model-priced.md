# Decision: remove the closed known gap test-model-unnamed-unpriced

- Task: HAL-7398
- Approval: [HAL-7398](/HAL/issues/HAL-7398) asks for this gap to be removed once it is fixed; Liam reviewed the change on [HAL-7433](/HAL/issues/HAL-7433) and approves this note in review on [HAL-7582](/HAL/issues/HAL-7582)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/0Sa6CnOE7vVWEM6Lrk5HJar+Sn1lTqnurcopRLbOi0moNeQikk+tSnMZeGr+BJ/RQVCoK1LPtoyXO+w4jfsAQ==

## What changes

`packages/testing/parity/known-gaps.json` loses the gap `test-model-unnamed-unpriced`. The test
runner now names and prices each model call as a real run does, and its parity run counts tokens
as the mock model does, so the base fixture's `billing/batch` test matches the old runner and no
longer needs the gap. The `billing/invoice` tests stay excused by `task-method-ignored` (HAL-4757).

## Why the note covers parity.known-gaps-checked

The test "accepts the package's own file, whose gaps name only tests of the base" in
`packages/testing/parity/src/known-gaps.test.ts` makes one `expect` call per gap in
`known-gaps.json`. With one gap fewer, the requirement's tests make 16 calls instead of 17, and the
guard reports that. No test was changed or weakened: the
count drops because the file it reads lists one gap fewer, which is what fixing a gap means (a
gap whose tests match is stale and fails, as the HAL-1541 note decided).

## Covers

- parity.known-gaps-checked
