# sandbox-srt.setup-after-helper

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

When Studio's shell has run Halonic's signed helper for the setup with its own administrator prompt, the sandbox-srt adapter shall say how the setup ended from the helper's exit code and the sandbox's unelevated check: done only when the exit code is 0 and the check passes, `check_failed` with what the check found missing when it doesn't, `cancelled` for the helper's cancelled code, and `failed` with the helper's reason sentence and its code for any other code. An exit code alone shall never count as done.

## Examples

- Given the helper exited with 0 and the check passes,
  then the setup is done.
- Given the helper exited with 0 and the check finds the sandbox account missing,
  then it ended `check_failed`, with what is missing.
- Given the helper exited with 33,
  then it ended `failed`, with the sentence that says the copy of the sandbox program was changed, and the code 33, and the check wasn't run.
