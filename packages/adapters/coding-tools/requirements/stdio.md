# coding-tools.stdio

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737, section 1; Liam's conditions on HAL-16748)

The coding tools server shall read one JSON-RPC message per line on its input and write one reply per line on its output, and nothing else on its output. It shall answer each request as it finishes, so a quick request isn't held up by a slow one. A `notifications/cancelled` shall stop the call it names, which then gets no reply. When its input ends, it shall cancel the calls still running and wait for them. It shall need `--temp-folder <path>`, refuse an argument it doesn't know, and make a new folder of its own in that temp folder for test logs.

Before it serves anything, the server shall refuse to start when the runtime or any file or folder of its code can be changed from where it runs, as when it runs from a copy of the repo the agent is editing: a file is opened for writing without being written, and a folder gets a new file that is removed at once.

## Examples

- Given a server with a working folder,
  when the client sends `initialize`, `tools/list` and a `read_ranges` call on three lines,
  then the output holds exactly three replies, one per line.
- Given code files the server's process can write,
  when it starts,
  then it refuses to start and names the first one.
