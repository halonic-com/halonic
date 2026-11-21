# routines.page.run-now-failed

- Status: active
- Since: unreleased
- Source: HAL-12411 (S3 and S5 of the UX check of the error lines on HAL-12390; L4 and L5 of the UX check on HAL-12363; wording on approved screens, a team decision under HAL-2282); the shared start-failure line of HAL-12412 (`startFailureOf`); `routines.page.run-now`.

When **Run now** doesn't start a run because the start failed, the toast that stays shall say "Couldn't start *Daily*." with the reason, its next step and the command that step leads to after it, as the Run panel's start-failure line has them (`startFailureOf`), so the window's refusal of what the routine starts keeps its own words and only an engine that can't be reached says it isn't answering. A toast has no room for a CommandBox, so the command shall end the line and **Copy command** shall copy it while the toast stays open. When starting again may help, such as a workspace another Halonic is running, the toast shall offer **Try again**, which starts the routine again; a refusal whose next step is somewhere else shall have no **Try again**.

## Examples

- Given the workspace is already running in another Halonic on this computer, when **Run now** is pressed on "Daily", then a toast that stays says "Couldn't start Daily." and "Acme is already running in another Halonic on this computer (process 4120). Stop that one, then try again.", with **Try again**, and **Try again** starts Daily again.
- Given Daily's workflow has an agent Reporter in Claude Code, which Halonic can't start yet, when **Run now** is pressed, then the toast says "Reporter runs in Claude Code, which Halonic can't start yet. To run it in Halonic's own loop instead, run this in a terminal: halonic run support-reply --harness halonic" with **Copy command** and no **Try again**, and **Copy command** puts the command on the clipboard and leaves the toast open.
- Given the engine can't be reached, then the toast says "The engine isn't answering." with **Try again**.
