# sandbox-srt.removal-around-helper

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

When Studio's shell removes the sandbox through Halonic's signed helper with its own administrator prompt, the sandbox-srt adapter shall first do the user's half without administrator rights: on Windows it shall take back the grants srt kept for this user, and fail with why when one stays recorded, so the shell asks Windows nothing; a process with administrator rights shall skip that and log that it did; other systems have nothing to do. After the helper it shall say how the removal ended from the helper's exit code: done for 0, `cancelled` for the helper's cancelled code, and `failed` with the helper's reason sentence and its code for any other code.

## Examples

- Given every kept grant is taken back,
  then the shell may start the helper.
- Given a kept grant stays recorded,
  then the removal failed with why, before any prompt.
- Given the helper exited with 36,
  then the removal ended `failed`, with the sentence that says the sandbox program couldn't start, and the code 36.
