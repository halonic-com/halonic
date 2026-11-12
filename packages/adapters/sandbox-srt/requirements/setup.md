# sandbox-srt.setup

- Status: active
- Since: 0.1.0
- Source: HAL-5074, HAL-1202, HAL-1451, HAL-1415, HAL-7385

The sandbox-srt adapter shall set the sandbox up for the installer, Studio and the CLI: on Windows, run srt's install for the whole machine without srt's profile read grant, then check the sandbox, and say it is done only when the check passes, or else how it ended (`cancelled`, `failed` or `check_failed`) and why in one line: the administrator prompt cancelled, the helper's reason sentence with its code, the install's own words, or what the check found missing. When Halonic's signed helper is next to the program that runs, the install shall go through the helper with one administrator prompt, and a helper code shall never be the whole reason. In Halonic's own program without the helper next to it, the setup shall fail with a reason and code 38, and never let srt ask for administrator rights itself; only under Node (the CLI from npm) does srt still do that. Running it again shall repair the install or change nothing. On other systems it shall install nothing and say there is no setup.

## Examples

- Given Windows where the install works,
  when the sandbox is set up, and set up again,
  then each time it is done and the check passes.
- Given Windows where the administrator prompt is cancelled,
  when the sandbox is set up,
  then it isn't done, it ended `cancelled`, and the reason says the prompt was cancelled.
- Given the helper next to the agent host, and a changed copy of srt-win,
  when the sandbox is set up,
  then it ended `failed`, with a sentence that says the copy was changed and the code 33.
- Given Halonic's own agent host with no helper next to it,
  when the sandbox is set up,
  then it ended `failed`, with a sentence that says the helper is missing and the code 38, and srt was not asked to install.
- Given Linux,
  when the sandbox is set up,
  then nothing is installed and it isn't done.
