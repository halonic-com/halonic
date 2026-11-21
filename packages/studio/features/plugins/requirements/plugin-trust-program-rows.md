# plugins.plugin-trust-program-rows

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design section 6 (HAL-1873); microcopy 24.1 R10, R11 and R11b, approved on HAL-1949; extends plugins.plugin-trust-check

When the app says whether the plugin's programs can run on this computer, each program in the trust check's Programs section shall say so in its **Runs** row. When the agent sandbox can't start and plugin code isn't in the sandbox because the computer is Windows (`windows`), the row shall be "Off on this computer until you set up the agent sandbox. The tool that uses it stays off.", followed by "Set it up in Settings › Agent sandbox, or use Halonic inside WSL 2." and, where the window can open Settings, the link **Set up the agent sandbox**. When the agent sandbox can't start otherwise, the row shall be "Doesn't start on this computer: the sandbox can't start here. The tool that uses it stays off." For a program with more than one tool, "The tool that uses it stays off." shall read "The tools that use it stay off." On Windows, when the program can run or the app doesn't say, its **Runs** row shall be followed by "On Windows, the sandbox can't hold a program to the addresses it lists, so it may reach others." in amber with a triangle; a program that only runs in the desktop app shall get no such line.

## Examples

- Given Weather's program on Windows, with the agent sandbox not set up,
  then its row says "Off on this computer until you set up the agent sandbox. The tool that uses it stays off." and "Set it up in Settings › Agent sandbox, or use Halonic inside WSL 2."
- Given the same, in a window that can open Settings,
  when the person presses **Set up the agent sandbox**,
  then Settings › Agent sandbox opens.
- Given a program with two tools, in a container where the sandbox can't start,
  then its row says "Doesn't start on this computer: the sandbox can't start here. The tools that use it stay off."
- Given Weather's program on Windows, with the agent sandbox set up,
  then its row says "In the agent sandbox, in its own empty folder" and, under it, "On Windows, the sandbox can't hold a program to the addresses it lists, so it may reach others."
