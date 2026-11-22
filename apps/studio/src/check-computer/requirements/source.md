# studio.check-computer.source

- Status: active
- Since: unreleased
- Source: HAL-13411; first-run-progress 4.1 and 4.2 on HAL-7986 (approved by the board on 19 Nov, HAL-7993); `check-computer.dialog`; `agent-host.doctor-route`

When an open folder's Check this computer runs its checks, the desktop app shall start every part at once and give each line as soon as what it needs has answered: **Engine**, whether the background engine answers `GET /api/hello` (running, for the page's own engine); each **Google** setup that was started and has a step left, with the first step not done, how many there are and when it started; the agent host's **Workspace**, **Sandbox**, **Harnesses**, **Network** and **Disk** lines (`POST /v1/doctor` with the folder) without their actions; **Models**, from the host's model servers, each cloud provider the aliases use with whether its key is stored (or "unreadable" when the key store can't be asked), and Sample answers when a provider is the test model, read from the saved files as `halonic doctor` reads them (`doctorWorkspace`); in the demo, **Default model** (`defaultModelLine`); and **Last run**, when the folder's last run (not a test run) failed, with the step it stopped at, how many steps the workflow has besides its final ones, the step's and the agent's names, how long it ran and what stopped it (`runFailureOf`), pointing at the line above that shows its cause (`lastRunLine`), with the run's hub. In the demo, the Sandbox and Harnesses lines shall be left out for a **Not checked** line "sandbox, harnesses", and Disk shall show only when it isn't fine. A part that fails shall give no line, and say so on the console; without an agent host, the host's lines shall be left out.

## Examples

- Given the demo, an agent host that answers Sandbox, Harnesses, Disk (enough space) and Workspace, and a stored Anthropic key for `default`,
  then the lines are Engine, Workspace, Not checked "sandbox, harnesses", Models with Anthropic's key stored, and Default model pointing at Anthropic.
- Given the folder's last run failed at its second step of three because Anthropic's account has no credit,
  then the Last run line says step 2 of 3, its step's name and its cause, with the run's hub.
- Given a key store that can't be asked,
  then the Models line has the key as "unreadable".
- Given an agent host that fails,
  then the host's lines are left out and the other lines still come.
