# harness-kit.coding-tools-server

- Status: active
- Since: unreleased
- Source: HAL-16737 plan, PR 4; Liam's conditions on HAL-16748 and HAL-16752; HAL-16753; HAL-17183

When the host gives the harness profile builder a coding tools server, the builder shall resolve the server's program and code paths to their real places and check, from outside the sandbox and before any program starts, that the server names at least one code path, that its program lies inside one, that none of its code paths is, holds or lies inside the working folder or another folder the program may write, and that none is denied. If a path can't be resolved or any check fails, then the profile shall name no server; otherwise it shall add every real code path to the profile's read-only paths and pass the server on. A code path inside Halonic's data folder, such as the agent host's unpacked payload, shall also be kept out of that folder's deny and reopened, read-only, as the instructions folder is; a code path a writable folder holds shall be neither. The harness kit shall give a harness the server's command for a run only when the task names a server and the session's fence state is `fenced`; an unknown or missing fence state shall name no server.

## Examples

- Given a server whose code is in a folder outside the workspace and Halonic's data,
  when a profile is built,
  then the code is read-only in the profile and the profile names the server.
- Given a server whose code lies inside the workspace the agent writes, or a working folder inside the server's code,
  when a profile is built,
  then the profile names no server and doesn't list its code.
- Given a server whose code path is a link into the workspace the agent writes,
  when a profile is built,
  then the profile names no server.
- Given a server with no code path, or whose program lies outside its code paths,
  when the outside check runs,
  then it names no server.
- Given a server whose code lies inside a denied folder,
  when a profile is built,
  then the profile names no server.
- Given a task with a server and a session whose fence state is `off`, unknown or missing,
  when a harness asks for the command,
  then it gets none.
- Given a server whose code lies in a folder of Halonic's data folder that no run writes,
  when a profile is built,
  then that folder is reopened read-only and the profile names the server.
- Given a server whose code lies in the run's temp folder,
  when a profile is built,
  then nothing of it is reopened or read-only, and the profile names no server.
