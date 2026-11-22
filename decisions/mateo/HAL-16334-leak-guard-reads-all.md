# Decision: the leak guard reads all the text of every commit and file it scans

- Task: HAL-16334
- Approval: follows the release review's follow-ups that Liam assigned on HAL-16334; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3BFks6FO4y9k2+N73YpBoM8J6TH4UJzXhAqMN4HmqQGT7FB04BvT3x2Wf+fy3P6tohZcz80U6/zIWVa0KboFCg==

## What changes

- `commitChanges` splits `git log` output on separators made new for each scan (a NUL byte and a
  random value), so a commit's own text can't end its record early.
- A file with NUL bytes is scanned like any other file. A file with a byte-order mark is decoded
  by it (UTF-16 in either order, UTF-8); without one, NUL bytes are dropped before the rules read
  it. When a diff line can't be read as UTF-8, the guard reads the whole new file from git
  (`git cat-file blob`) and decodes it.
- The diff filter includes `T`, so a file whose type changed is scanned.

## Why

Follow-up from the 0.1.2 release review (HAL-16334): the guard should never report clean for
text it didn't read.

## Tests

No test was weakened, skipped or deleted. `git-changes.repo.test.ts` is new: it runs the readers on
a throwaway repo, and five of its six tests fail on the reader before this change.

## Covers

- tooling/check/
