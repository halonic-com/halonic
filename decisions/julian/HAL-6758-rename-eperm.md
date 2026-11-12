# Decision: a held rename on Windows is tried for just under two seconds, not a third of one

- Approval: Liam asked for the fix in [HAL-6758](/HAL/issues/HAL-6758); the package owner approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wRck3G18gNWTWiv2oMr7+9st1J7UpfIvR4j/TQyrWr94aVKb+8S2HWS3/IKHXMKKTRyhYqld6pKDCI9XF4TTCQ==
- Task: HAL-6758

## What changes

`fs-node.rename-retry-on-windows` now tries a rename Windows refuses up to fifteen more times,
waiting 10, 20, 40 and 80 milliseconds and then 160 milliseconds eleven times, 1.91 seconds in
all. Before, it tried five more times over 310 milliseconds. The requirement names a program that
keeps reading the file, such as Studio, besides a scanner or indexer that holds it briefly.

## Why

CI on `main` failed on Windows in "never lets a reader see half a file while it is rewritten": the
folder definition store's write did go through the retry, but the test reads the file in a tight
loop, so the file is open almost all the time and a rename only gets through in a gap between two
reads. On a loaded runner six tries in 310 milliseconds all hit a read, and the write failed with
`EPERM`. Studio reading a file while a person saves it is the same situation, and the save must
not fail because of it. Two seconds matches the limit the busy retry and the Studio run lock
already use (`busyLimitMs`). A file that stays held still fails the write, now after two seconds
instead of a third of one.

The test also hung for 30 seconds after such a failure, because its reader loop only stopped when
the writer finished. It now stops when the writer fails too, so the real error shows at once.

## Covers

- fs-node.rename-retry-on-windows
