# settings.sandbox-setup-flow

- Status: active
- Since: 0.1.0
- Source: HAL-5405 (PR 3); HAL-3777 (plan) S3 to S5; HAL-3777 (wording, final); HAL-11149 (O2 to O8)

The Studio shall show the sandbox setup in the same card as the choice: **Setting up your sandbox** with the steps of the path (WSL: five; native: three), each marked Done, Working… or Waiting, the line before the permission prompt when the engine says one is next, and **Cancel**; when the download failed, the offline line with **Try again** and **Other options**. It shall show **Restart to finish** with **Restart now** and **Restart later**; **We couldn't set this up** with one reason and one hint in plain words and **Choose another option** and **Continue without sandbox**; and, on macOS and Linux, **One thing is missing** with the command in a box with **Copy**, the ready or missing line of each tool and **Check again**. The quick test shall list the checks it is given, in order, with a tick, a cross or a waiting mark each that a screen reader reads, and shall never invent a check. A failed test shall name the failed check and offer **Try again**, **Choose another option** and **Continue without sandbox**. Done shall say the sandbox is on and name it, add the caveat only when one is given, and offer **Open Halonic**; done without a sandbox shall say so, and shall show the sentence that agents ask first only when told that they do. The screens shall only report what the person pressed; they shall decide and save nothing.

## Examples

- Given the WSL path with two steps done,
  when the setup shows,
  then the first two steps read Done, the third Working… and the last two Waiting.
- Given a test result with three checks and the second failed,
  when the test shows,
  then it lists exactly those three checks and the second is read as "didn't pass".
- Given no sandbox and no promise that agents ask first,
  when the last screen shows,
  then it doesn't say that agents will ask.
