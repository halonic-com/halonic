# Decision: any cancelled child run leads to the run that started it

- Task: HAL-15755
- Approval: HAL-15755; Liam reviews this pull request and signs this note as the CTO (a team decision under HAL-2282: Nina's C626 #4 on HAL-15750 asks for the way to the parent that HAL-12411 and HAL-15555 already gave, with no new words)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i8PBGj74zLkb2L9rMOqolV4IdIIeTpl2I6qalewVVdVUv/G6SBzmkOfTFa4f38YSDBe0BVr68+f5AUv86TklAQ==

## What changes

When a person cancels a for-each run, its item runs are cancelled with it and, on purpose, get no
`run.parent-ended` cause (the person did cancel). So an item's page read "Sort one was cancelled in
the step Each word. Nothing after it ran." with nothing leading to the parent, and the person never
cancelled that run themselves.

Now any cancelled run that has a parent gets the way to it, whatever ended it:

- Studio's run page: the cancelled note is followed by **Open run** and the parent's short id,
  as a child run its parent's end cancelled already had.
- `halonic runs show`: the ✕ line is followed, indented, by "See the run that started it:
  halonic runs show 4f2a1b", with the user's `--dir`.

The lines themselves don't change: the parent-ended cause still says "was cancelled because the run
that started it ended", and a run without it keeps the plain line. A cancelled run without a parent
is as before.

## Why

C626 #4 (HAL-15750): the page of an item run whose parent a person cancelled was a dead end. The
link costs nothing and is right in every case: the run has a parent, and the parent's page says who
cancelled it. New words such as "was cancelled with the run that started it" would need a cause the
engine doesn't give these items, and would be wrong for a child a person cancelled on its own.

## Tests

No test was removed. Two expectations changed to the new behaviour: an older log without the cause
now also has the parent link, in `run-page-model.test.ts` and `show-failed.test.ts`. A new test
covers a for-each item whose parent the person cancelled, in a step and before it started.

## Covers

- runs.run-page
- cli.commands.runs.show
