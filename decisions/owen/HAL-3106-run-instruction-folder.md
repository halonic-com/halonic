# Decision: the harness kit makes the run's instructions folder and cleans it up

- Task: HAL-3106 (slice 2), reviewed on HAL-10108
- Approval: HAL-10108, Liam's review of the stacked pull request; Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:K5WWTGFX8f8sGIwiii9NN5WyFhBGzagfQGbbHGXOq5kvFG7z7ykG8yTxpGe5sw/AJ9m9tfs9rDmnMSAaA7zQDA==

## What changes

`harness-kit.instruction-snapshot` gains one sentence and one example. The kit now makes the run's instructions folder itself, new and its own below the run's folder. When any file can't be written, it removes that folder again, whatever the files' mode, and reports the write's error. The new example is a disk that fails on the second file: the error is the disk's and no folder is left.

Nothing the requirement promised before is taken away. The copy stays read-only and never over an existing file, the pin is still taken from the text written, and names are still checked before anything is written.

## Why

These are Liam's three notes on #2881: use the run's own `mkdtemp` folder, clean up on any copy error, and test that read-only copies can be removed (the test runs on the Windows job too).

## Tests

No test was weakened or removed. The new tests check the failed-copy cleanup and the removal of read-only copies.

## Covers

- harness-kit.instruction-snapshot
