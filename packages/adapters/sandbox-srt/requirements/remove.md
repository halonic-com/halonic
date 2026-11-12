# sandbox-srt.remove

- Status: active
- Since: 0.1.0
- Source: HAL-6180, HAL-1202, HAL-1451

The sandbox-srt adapter shall remove what its setup left on the machine, for the uninstaller and Studio: on Windows, run srt's uninstall (through Halonic's signed helper when it is next to the program that runs), and say it is done, or else how it ended (`cancelled` or `failed`) and why in one line (the administrator prompt cancelled, the helper's reason sentence with its code, or the uninstall's own words). It shall be done when nothing was set up, and when run again. On other systems it shall remove nothing and say it is done, since there is nothing to remove.

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
