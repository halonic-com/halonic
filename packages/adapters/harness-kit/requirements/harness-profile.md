# harness-kit.harness-profile

- Status: active
- Since: 0.1.0
- Source: HAL-189 plan 4h and changes from the review (HAL-1967); HAL-4739; HAL-4790; HAL-4878 requirement 1; HAL-5127; HAL-5644

When the engine asks for a harness call's sandbox profile, the harness kit shall build it from the trusted workspace, Halonic's data folder and the person's home folder, on real paths, with every symlink and junction resolved:

- The working folder shall be the one the agent's file names, or `files/agents/<agent id>`, inside the run's proposal folder when the agent has one (`filesFolder`), and inside the workspace otherwise. Each missing part shall be made inside the real place of the part before it. The builder shall refuse a working folder that, as named or at its real place, is that folder itself, leaves it, or is in `.git`, a definition folder or a folder that starts with `.`, and, without a proposal folder, one that is, holds or is inside Halonic's data folder.
- A proposal folder shall be inside Halonic's data folder and shall neither be, hold nor be inside the workspace, so a profile with one writes nowhere in the workspace.
- The temp folder and the settings folder the host gives shall be inside Halonic's data folder.
- The definition files and folders at the top of the folder the agent works in shall be read-only. On Windows, the harness's install folders in the user profile shall be read-only too (`harness-kit.windows-install-folders`).
- The denied paths shall be in groups: the person's SSH keys, cloud sign-ins, browser data, password stores and their own Claude Code and Codex settings, as far as they exist in the home folder, and `halonic-data`. On Linux and macOS, `halonic-data` shall deny the whole data folder, so a folder made in it after the profile is built is denied too. On Windows it shall name the data folder's entries that aren't on the way to the run's own folders, and not the data folder itself, so a program can still look at the folders on the way to its own.
- On Linux and macOS, the profile shall reopen the run's own folders in the data folder: the temp and settings folders, and with a proposal folder the working folder and the proposal folder's entries around it, at their real places. An entry that links out of the proposal folder shall stay denied.
- The builder shall refuse a profile whose denied paths would hold a folder the program needs and that isn't reopened, and shall refuse a temp or settings folder that isn't there. A read-only path the profile denies shall be left out of the read-only paths.
- The program's network shall be the run's bridge and the sites the agent's file allows; its variables shall be the host's list with `TMPDIR` set to the temp folder.

## Examples

- Given an agent without a proposal folder,
  when its profile is built,
  then its working folder is made in the workspace, the workspace's `agents` folder is read-only, and the data folder is denied but for the temp and settings folders.
- Given an agent with a proposal folder,
  when its profile is built,
  then its working folder is in the proposal folder, none of its writable folders is in the workspace, the data folder is denied, and only the run's own folders in it are reopened.
- Given a profile built on Linux or macOS,
  when another run then makes its proposal, temp or settings folder in the data folder,
  then that folder is in a denied path and in no reopened one.
- Given a working folder reached through a link out of the workspace, or into `.git`,
  when its profile is built,
  then it is refused.
- Given a workspace inside `~/.aws`,
  when a profile is built,
  then it is refused.
- Given a workspace that holds Halonic's data folder, such as the home folder,
  when a profile is built without a proposal folder,
  then the data folder is still denied but for the run's temp and settings folders.
