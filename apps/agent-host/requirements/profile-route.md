# agent-host.profile-route

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `engine.run-proposal-folder`

When Studio asks for a harness call's sandbox profile, the agent host shall build it with the harness profile builder for a workspace the launcher named and answer the profile with its denied groups. It shall take from the caller only the agent's working folder, allowed sites and proposal folder, and the bridge by id, and shall take Halonic's data folder, the home folder and the program's variables from its own. It shall answer 404 for a workspace the launcher did not name, a harness it does not have and a bridge that is not open, and 422 `profile_refused` with the builder's reason when the builder refuses (a working folder that leaves the workspace, say). It shall never put the bridge's token in the answer, and when a session of such a profile closes it shall remove the temp folder it made for it, and no other folder. A profile whose session does not open within ten minutes shall have its temp folder removed too. A session opened for that profile afterwards shall find no temp folder: the host shall not make it again, so that session fails closed.

## Examples

- Given a named workspace and an open bridge,
  when Studio asks for the profile of the agent `writer`,
  then the answer's working folder is inside the workspace, its denied paths include Halonic's data folder, and the bridge's token is nowhere in it.
- Given a folder the launcher did not name,
  when Studio asks,
  then the answer is 404 `unknown_workspace` and nothing is made.
- Given a working folder `../elsewhere`,
  when Studio asks,
  then the answer is 422 `profile_refused`.
- Given a profile whose session has closed,
  then its temp folder is gone, and a folder the host did not make is still there.
- Given a profile whose session never opens,
  then its temp folder is removed after the wait, and the folder of a profile whose session opened stays until that session closes.
- Given a Windows host,
  when Studio asks,
  then the answer is 422 until the host finds where the harness is installed there.
