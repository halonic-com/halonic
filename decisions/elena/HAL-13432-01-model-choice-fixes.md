# Decision: build 3's model choice, fixed before the Pick a model screen uses it

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13432 (Liam's post-merge review of #3960 on HAL-13431, asked for in this build)
- Kind: internal

## What changes

- `studio.first-run-choice-order`: when the files fail to save, Continue takes its undo step back,
  while it is still the newest, so the choice isn't left waiting for autosave. Where nothing saves
  the files (the browser demo), Continue fails at `no-save` and saves no key and no file, where it
  said `ok` with nothing saved.
- `studio.first-run-key-after-test`: a test that fails after a newer one started is `superseded`
  too, as a passed one already was.

## Why

Liam's review of #3960 found the three cases: the edits stayed waiting after a failed save while
the answer said the choice wasn't saved, the browser got `ok: true` for nothing, and a slow failure
could come back after a newer test. Every old example still holds; the two old tests of these cases
only gain checks, and two tests are added. No test was weakened.

## Covers

- studio.first-run-choice-order
- studio.first-run-key-after-test
