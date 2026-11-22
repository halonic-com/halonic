# Decision: Help › First run's item is called "Show the guide again"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14977 (the board's decision C520-9, which quotes Noah's drawn sheet: the item is **Show the guide again**); built on https://paperclip.halonic.com/HAL/issues/HAL-15164 and https://paperclip.halonic.com/HAL/issues/HAL-15316
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:R+qhZg1uK3aMJMBKV+h8Ox+VTomj6M4FZ1X+7uGAZ37wdQg3+JUCDhEfLxbMgRf6LytwAlYE8M+IaqE4jGDhCg==

Help › First run's **Show the guide** is renamed **Show the guide again**, the name on Noah's sheet that the
board approved. Only the label changes; what the item does and the line under it stay the same.

- `first-run.help`: the statement and its examples name **Show the guide again**.
- `shell.help-menu`, `shell.phone-help`: their examples name **Show the guide again**.

Neither 0.2 change has been released, so `.changeset/help-first-run.md` now tells the whole menu in one
sentence, with the new label, in place of `help-show-guide-again.md` and `first-run-keeps-promises.md`
(claims check C598, HAL-15596).

No test is weakened or removed: the tests that named the old label now expect the new one.

## Covers

- first-run.help
- shell.help-menu
- shell.phone-help
