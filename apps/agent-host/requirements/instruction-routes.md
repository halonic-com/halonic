# agent-host.instruction-routes

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `engine.harness-instructions-trust`

When Studio asks for a harness run's instructions folder, the agent host shall copy the files it is given, read-only, into a new folder in the harness temp folder of the person's profile for a workspace the launcher named, and answer the folder and the pin of what it wrote. It shall refuse a location that isn't the real path of a named workspace with 404 `unknown_workspace`, making nothing, and a name that isn't `AGENTS.md` or a skill's `SKILL.md` with 422 `instructions_refused`. When Studio releases a folder, the host shall remove it only when it made it, and leave any other path alone. It shall remove every folder it made when it stops, and clear what a host that stopped left before it makes a workspace's first folder.

## Examples

- Given a named workspace,
  when Studio asks for a folder with `AGENTS.md` and a skill,
  then the folder is in the data folder, holds both files, and the answer pins them.
- Given a folder the host made and a path it didn't,
  when Studio releases each,
  then the folder is removed and the other path is still there.
- Given a folder the host made,
  when the host stops,
  then the folder is removed.
- Given a folder a host that stopped left,
  when a new host makes its first folder for the workspace,
  then the old folder is removed.
- Given a location the launcher did not name,
  then the answer is 404 `unknown_workspace` and nothing is made.
- Given a file named `../escape.md`,
  then the answer is 422 `instructions_refused`.
- Given a body with a field the route does not know, or no files,
  then the answer is 400.
