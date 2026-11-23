# paperclip.worker-agents-page

- Status: active
- Since: unreleased
- Source: HAL-16249; the "Worker agents" page the board approved on HAL-16201 (addendum 2 on HAL-15997, sections 1 and 3), with the states and wording of HAL-16208

When a caller asks for the Agent tools plugin's "Worker agents" page data, the plugin shall answer only a signed-in board user, read nothing for anyone else, offer the data through no agent tool, and give the board agents with their newest run, then one row per worker agent other than Pip with its task in progress that changed last and how many more are in progress, its newest run, and its failed runs of the last 24 hours as counts per cause code, and the page shall only read.

## Examples

- Given an agent's key,
  when it asks for the page's data,
  then the plugin refuses with 403 and reads nothing.
- Given the Board Checker, Pip, Ravi with two tasks in progress and 3 timed-out runs, and Kim with nothing,
  when a board user asks for the page's data,
  then the Board Checker is in the strip, Pip is left out, Ravi comes first with the task that changed last, "and 1 more in progress" and `timeout` 3, and Kim's row says "No runs yet".
- Given the page's data can't be loaded,
  when the page shows it,
  then it says the bridge's error code in lower case, never its message.
