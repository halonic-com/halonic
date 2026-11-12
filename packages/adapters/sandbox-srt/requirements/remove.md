# sandbox-srt.remove

- Status: active
- Since: 0.1.0
- Source: HAL-6180, HAL-1202, HAL-1451, HAL-7385, HAL-7544, HAL-7585

The sandbox-srt adapter shall remove what its setup left on the machine, for the uninstaller and Studio: on Windows, run srt's uninstall (through Halonic's signed helper when it is next to the program that runs; in Halonic's own program without the helper, fail with a reason and code 38 rather than let srt ask for administrator rights itself; before the helper's machine-wide step, take back the grants srt kept for this user, in its own process and only when that process doesn't run with administrator rights, and stop before the administrator prompt when that fails; when the process runs with them, log that it skipped this), and say it is done, or else how it ended (`cancelled` or `failed`) and why in one line (the administrator prompt cancelled, the helper's reason sentence with its code, or the uninstall's own words). It shall be done when nothing was set up, and when run again. On other systems it shall remove nothing and say it is done, since there is nothing to remove.

## Examples

- Given Windows with the sandbox set up,
  when the sandbox is removed, and removed again,
  then each time it is done, and the check then says the setup is needed.
- Given Windows where the administrator prompt is cancelled,
  when the sandbox is removed,
  then it isn't done, the reason says the prompt was cancelled, and the sandbox still works.
- Given Linux,
  when the sandbox is removed,
  then nothing is uninstalled and it is done.
- Given Windows with the sandbox set up through the helper,
  when the sandbox is removed by a program without administrator rights,
  then the program itself first takes back the profile read grant and the kept write grants, and the helper then runs only srt's machine-wide step.
- Given Windows where a sandboxed program runs,
  when the sandbox is removed through the helper by a program without administrator rights,
  then it fails before the administrator prompt, so trying again asks for an administrator once.
- Given Windows with the sandbox set up through the helper,
  when the sandbox is removed by a program with administrator rights,
  then the helper runs srt's machine-wide step, it is done, and a log line says the kept grants weren't taken back.
