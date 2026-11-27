# studio.open-folder-before-engine

- Status: active
- Since: unreleased
- Source: HAL-19965 (step 4 of the plan on HAL-19531, Liam's approval there); the board on HAL-10 (27 Nov): no run has to start when a workspace opens; the wording from HAL-19613

When a desktop window opens a workspace folder, the Studio shall show the workspace from its files without waiting for the shell's answer to `engine_open`. Until that answer comes, the workspace's `engineStarting` shall say it starts, and while the workspace shows, the window shall show the line "Starting the engine…" over the page. When the answer comes, the window shall attach the engine `studio.remote-engine` chooses: the background engine when it answers `GET /api/hello`, else the window's own engine, and the line shall go. Opening a workspace shall not change the shell's window-wide engine connection, so a second workspace's start neither marks the engine stale nor stops an answer in a workspace already open. A run start, Run now, an answer to a waiting run, a cancel, a chat turn and the list of what waits shall wait for that answer, and shall go to the engine it chose, so nothing starts before that engine is chosen. The window's own engine shall not open for the routines before the shell answered that no background engine runs, nor once the workspace has closed.

## Examples

- Given the shell's engine is still starting,
  when the person opens Recent's "acme",
  then the workspace shows, and the line over the page says "Starting the engine…".
- Given the workspace shows while the engine starts,
  when the person runs a workflow,
  then nothing is sent to an engine until the shell answers, and then the run starts with `POST /api/runs`.
- Given the shell answers that no engine runs for the folder,
  when the Inbox lists what waits,
  then it reads the run logs, as the window's own engine does.
- Given "acme" is open and its engine answers,
  when the person opens "globex" while its engine starts,
  then no "The engine isn't answering" line or announcement comes, and switching back to "acme" shows no "Starting the engine…" line.
