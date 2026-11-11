# harness-kit.windows-install-folders

- Status: active
- Since: 0.1.0
- Source: HAL-5124; HAL-5129

While the sandbox runs on Windows, where sandboxed programs don't get srt's read grant for the user profile, the harness kit shall give the paths a harness's sandbox profile names read-only for the harness to start: the folder of the program the sandbox starts, and for a harness that runs on Node, the harness's package folder. Each shall be named at its real place, symlinks and junctions resolved, and only when it is inside the user profile, such as `%USERPROFILE%\.local\bin`, a package under `%APPDATA%\npm\node_modules`, or an nvm or fnm Node folder; a path outside the profile adds nothing. Paths shall compare in any letter case. It shall never name the user profile itself, and shall refuse a folder that is the profile, or that is, holds or is inside Halonic's data folder, because the profile denies that folder. The user profile and Halonic's data folder shall be compared at their real places too, and a data folder that doesn't exist yet at the real place of the nearest folder on its way that exists, with the rest of its names added. An install path it can't resolve shall be refused, naming it.

## Examples

- Given Claude Code in `%USERPROFILE%\.local\bin`,
  when the read paths are asked for,
  then they are that folder only.
- Given Codex in `%APPDATA%\npm\node_modules\@openai\codex`, run by `%ProgramFiles%\nodejs\node.exe` that links to an nvm Node folder,
  when the read paths are asked for,
  then they are the nvm Node folder and the package folder, and neither the user profile nor `%APPDATA%\npm`.
- Given a harness installed in `%ProgramFiles%`,
  when the read paths are asked for,
  then there are none.
- Given a user profile reached through a junction, a Halonic data folder that doesn't exist yet, and a program at the junction's target inside where that data folder will be,
  when the read paths are asked for,
  then they are refused.
- Given a program straight in the user profile, or in Halonic's data folder,
  when the read paths are asked for,
  then they are refused.
